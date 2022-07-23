import * as PromClient from "prom-client"
import { getParachainName, decimals } from '../index';
import { logger } from '../logger';
import { Exporter } from './IExporter';
import { ApiPromise } from "@polkadot/api";
import { Header, SignedBlock } from "@polkadot/types/interfaces";
import { xxhashAsHex } from "@polkadot/util-crypto";

class SystemExporter implements Exporter {
    palletIdentifier: any;
    finalizedHead: PromClient.Gauge<"class" | "chain">;
    blockWeight: PromClient.Gauge<"class" | "chain">;
    blockLength: PromClient.Gauge<"class" | "chain">;
    numExtrinsics: PromClient.Gauge<"type" | "chain">;
    palletSize: PromClient.Gauge<"pallet" | "item" | "chain">
    //timestamp
    timestampMetric: PromClient.Gauge<"pallet" | "chain">
    //multi-phase
    multiPhaseUnsignedSolutionMetric: PromClient.Gauge<"measure" | "chain">
    multiPhaseSignedSolutionMetric: PromClient.Gauge<"measure" | "chain">
    multiPhaseQueuedSolutionScoreMetric: PromClient.Gauge<"score" | "chain">
    multiPhaseSnapshotMetric: PromClient.Gauge<"chain">

    constructor(registry: PromClient.Registry) {

        registry.setDefaultLabels({
            app: 'runtime-metrics'
        })

        this.palletIdentifier = "system";

        this.finalizedHead = new PromClient.Gauge({
            name: "chain_finalized_number",
            help: "finalized head of the chain.",
            labelNames: ["class", "chain"]
        })
        this.blockWeight = new PromClient.Gauge({
            name: "runtime_weight",
            help: "weight of the block; labeled by dispatch class.",
            labelNames: ["class", "chain"]
        })
        this.blockLength = new PromClient.Gauge({
            name: "runtime_block_length_bytes",
            help: "encoded length of the block in bytes.",
            labelNames: ["class", "chain"]

        })
        this.numExtrinsics = new PromClient.Gauge({
            name: "runtime_extrinsics_count",
            help: "number of extrinsics in the block, labeled by signature type.",
            labelNames: ["type", "chain"]
        })
        this.palletSize = new PromClient.Gauge({
            name: "runtime_pallet_size",
            help: "entire storage size of a pallet, in bytes.",
            labelNames: ["pallet", "item", "chain"]
        })
        // timestamp
        this.timestampMetric = new PromClient.Gauge({
            name: "runtime_timestamp_seconds",
            help: "timestamp of the block.",
        })

        // election-provider-multi-phase
        this.multiPhaseUnsignedSolutionMetric = new PromClient.Gauge({
            name: "runtime_multi_phase_election_unsigned",
            help: "Stats of the latest unsigned multi_phase submission.",
            labelNames: ["measure", "chain"]
        })

        this.multiPhaseSignedSolutionMetric = new PromClient.Gauge({
            name: "runtime_multi_phase_election_signed",
            help: "Stats of the latest signed multi_phase submission.",
            labelNames: ["measure", "chain"]
        })

        this.multiPhaseQueuedSolutionScoreMetric = new PromClient.Gauge({
            name: "runtime_multi_phase_election_score",
            help: "The score of any queued solution.",
            labelNames: ["score", "chain"]
        })

        this.multiPhaseSnapshotMetric = new PromClient.Gauge({
            name: "runtime_multi_phase_election_snapshot",
            help: "Size of the latest multi_phase election snapshot.",
            labelNames: ["chain"]

        })

        registry.registerMetric(this.finalizedHead);
        registry.registerMetric(this.blockWeight);
        registry.registerMetric(this.blockLength);
        registry.registerMetric(this.numExtrinsics);
        registry.registerMetric(this.palletSize);
        registry.registerMetric(this.timestampMetric);
        registry.registerMetric(this.multiPhaseUnsignedSolutionMetric);
        registry.registerMetric(this.multiPhaseSignedSolutionMetric);
        registry.registerMetric(this.multiPhaseQueuedSolutionScoreMetric);
        registry.registerMetric(this.multiPhaseSnapshotMetric);

    }

    async perBlock(api: ApiPromise, header: Header, chainName: string): Promise<void> {

        this.finalizedHead.set({ chain: chainName }, header.number.toNumber());

        const weight = await api.query.system.blockWeight();
        this.blockWeight.set({ class: "normal", chain: chainName }, weight.normal.toNumber());
        this.blockWeight.set({ class: "operational", chain: chainName }, weight.operational.toNumber());
        this.blockWeight.set({ class: "mandatory", chain: chainName }, weight.mandatory.toNumber());

        const block = await api.rpc.chain.getBlock(header.hash);
        this.blockLength.set({ chain: chainName }, block.block.encodedLength);

        const signedLength = block.block.extrinsics.filter((ext) => ext.isSigned).length
        const unsignedLength = block.block.extrinsics.length - signedLength;

        this.numExtrinsics.set({ type: "signed", chain: chainName }, signedLength);
        this.numExtrinsics.set({ type: "unsigned", chain: chainName }, unsignedLength);

        let number = header.number;
        logger.info(`starting block metric scrape at #${number} for ${chainName}`)
        const [timestamp, signed_block] = await Promise.all([
            api.query.timestamp.now(),
            api.rpc.chain.getBlock(header.hash)
        ]);

        this.timestampMetric.set(timestamp.toNumber() / 1000);

        await this.multiPhasePerBlock(api, signed_block, chainName);

    }

    async doLoadHistory(threadsNumber:number, startingBlock: number, endingBlock : number, chain: string) { }

    async perDay(api: ApiPromise, chainName: string) { }

    async perHour(api: ApiPromise, chainName: string) {
        for (let pallet of api.runtimeMetadata.asV14.pallets) {
            const storage = pallet.storage.unwrapOrDefault();
            const prefix = storage.prefix;
            for (let item of storage.items) {
                const x = xxhashAsHex(prefix.toString(), 128);
                const y = xxhashAsHex(item.name.toString(), 128);
                const key = `${x}${y.slice(2)}`;
                const size = await api.rpc.state.getStorageSize(key);
                logger.info(`size if ${prefix.toString()}/${item.name.toString()}: ${size.toNumber()}`)
                console.log('============ setting palletssize ==============', 'chain', chainName, item.name.toString(), size.toNumber())
                this.palletSize.set({ chain: chainName, pallet: prefix.toString(), item: item.name.toString() }, size.toNumber());
            }
        }
    }

    async multiPhasePerBlock(api: ApiPromise, signedBlock: SignedBlock, chainName: string) {
        // check if we had an election-provider solution in this block.
        for (let ext of signedBlock.block.extrinsics) {

            if (ext.method.section.toLowerCase().includes("electionprovider") && ext.method.method === "submitUnsigned") {
                let length = ext.encodedLength;
                let weight = (await api.rpc.payment.queryInfo(ext.toHex())).weight.toNumber();
                logger.debug(`detected submitUnsigned`);
                this.multiPhaseSignedSolutionMetric.set({ 'measure': 'weight', chain: chainName }, weight);
                this.multiPhaseSignedSolutionMetric.set({ 'measure': 'length', chain: chainName }, length);
            }

            if (ext.method.section.toLowerCase().includes("electionprovider") && ext.method.method === "submit") {
                let length = ext.encodedLength;
                let weight = (await api.rpc.payment.queryInfo(ext.toHex())).weight.toNumber()
                logger.debug(`detected submit`);
                this.multiPhaseUnsignedSolutionMetric.set({ 'measure': 'weight', chain: chainName }, weight);
                this.multiPhaseUnsignedSolutionMetric.set({ 'measure': 'length', chain: chainName }, length);
            }
        }

        // If this is the block at which signed phase has started:
        let events = await api.query.system.events();
        if (events.filter((ev) => ev.event.method.toString() == "SignedPhaseStarted").length > 0) {
            let key = api.query.electionProviderMultiPhase.snapshot.key();
            let size = await api.rpc.state.getStorageSize(key);
            logger.debug(`detected SignedPhaseStarted, snap size: ${size.toHuman()}`)
            this.multiPhaseSnapshotMetric.set({ chain: chainName }, size.toNumber());
        }

        if (events.filter((ev) => ev.event.method.toString() == "SolutionStored").length > 0) {
            let queued = await api.query.electionProviderMultiPhase.queuedSolution();
            logger.debug(`detected SolutionStored: ${queued.unwrapOrDefault().toString()}`)
            this.multiPhaseQueuedSolutionScoreMetric.set({ score: "x1", chain: chainName }, queued.unwrapOrDefault().score.minimalStake.div(decimals(api)).toNumber())
            this.multiPhaseQueuedSolutionScoreMetric.set({ score: "x2", chain: chainName }, queued.unwrapOrDefault().score.sumStake.div(decimals(api)).toNumber())
        }
    }
}

export { SystemExporter };

