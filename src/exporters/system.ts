import * as PromClient from "prom-client"
import { logger } from '../logger';
import { Exporter } from './IExporter';
import { ApiPromise } from "@polkadot/api";
import { Header } from "@polkadot/types/interfaces";
import { xxhashAsHex } from "@polkadot/util-crypto";

class SystemExporter implements Exporter {
    palletIdentifier: any;
    finalizedHead: PromClient.Gauge<"class" | "chain">;
    blockWeight: PromClient.Gauge<"class" | "chain">;
    blockLength: PromClient.Gauge<"class" | "chain">;
    numExtrinsics: PromClient.Gauge<"type" | "chain">;
    palletSize: PromClient.Gauge<"pallet" | "item" | "chain">
    specVersionning: PromClient.Gauge<"specname" | "chain">

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

        this.specVersionning = new PromClient.Gauge({
            name: "runtime_spec_version",
            help: "entire storage size of a pallet, in bytes.",
            labelNames: ["specname", "chain"]
        })

        registry.registerMetric(this.finalizedHead);
        registry.registerMetric(this.blockWeight);
        registry.registerMetric(this.blockLength);
        registry.registerMetric(this.numExtrinsics);
        registry.registerMetric(this.palletSize);
        registry.registerMetric(this.specVersionning);

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

        const versionDetails = await api.query.system.lastRuntimeUpgrade();
        const obj = JSON.parse(versionDetails.toString());
        this.specVersionning.set({ specname: obj.specName, chain: chainName }, obj.specVersion);

    }

    async doLoadHistory(threadsNumber: number, startingBlock: number, endingBlock: number, chain: string) { }

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
                this.palletSize.set({ chain: chainName, pallet: prefix.toString(), item: item.name.toString() }, size.toNumber());
            }
        }
    }
}

export { SystemExporter };


