import * as PromClient from "prom-client"
import { decimals } from '../index';
import { logger } from '../logger';

import { Exporter } from './IExporter';
import { ApiPromise, WsProvider } from "@polkadot/api";
import { Header, SignedBlock } from "@polkadot/types/interfaces";

class ElectionProviderMultiPhaseExporter implements Exporter {
    palletIdentifier: any;

    //multi-phase
    multiPhaseUnsignedSolutionMetric: PromClient.Gauge<"measure" | "chain">
    multiPhaseSignedSolutionMetric: PromClient.Gauge<"measure" | "chain">
    multiPhaseQueuedSolutionScoreMetric: PromClient.Gauge<"score" | "chain">
    multiPhaseSnapshotMetric: PromClient.Gauge<"chain">

    constructor(registry: PromClient.Registry) {
        this.palletIdentifier = "electionProviderMultiPhase";

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

        registry.registerMetric(this.multiPhaseUnsignedSolutionMetric);
        registry.registerMetric(this.multiPhaseSignedSolutionMetric);
        registry.registerMetric(this.multiPhaseQueuedSolutionScoreMetric);
        registry.registerMetric(this.multiPhaseSnapshotMetric);

    }

    async perBlock(api: ApiPromise, header: Header, chainName: string): Promise<void> {

        try {
            const [signed_block] = await Promise.all([api.rpc.chain.getBlock(header.hash)]);
            await this.multiPhasePerBlock(api, signed_block, chainName);

        } catch (error) {
            console.log('perBlock BalanceExporter error for chain', chainName, error)

        }
    }

    async perDay(api: ApiPromise, chainName: string) { }

    async perHour(api: ApiPromise, chainName: string) { }

    async doLoadHistory(threadsNumber: number, startingBlock: number, endingBlock: number, chain: string) { }

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

export { ElectionProviderMultiPhaseExporter };
