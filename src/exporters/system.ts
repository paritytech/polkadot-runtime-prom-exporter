import * as PromClient from "prom-client"
import { logger } from '../logger';
import { Exporter } from './IExporter';
import { ApiPromise } from "@polkadot/api";
import { Header } from "@polkadot/types/interfaces";
import { xxhashAsHex } from "@polkadot/util-crypto";
import { SYSTEM_WORKER_PATH } from '../workers/workersPaths'
import { System} from '../workers/systemWorker'

class SystemExporter extends System implements Exporter {
    palletIdentifier: any;
    exporterVersion: number;
	exporterIdenfier: string;
    
    palletSize: PromClient.Gauge<"pallet" | "item" | "chain">

    constructor(registry: PromClient.Registry) {
        super(SYSTEM_WORKER_PATH, registry, true);
        this.registry = registry;

        this.palletIdentifier = "system";
        this.exporterIdenfier = "system";
        this.exporterVersion = 1;

        //pallet size is calculated per hour 
        this.palletSize = new PromClient.Gauge({
            name: "runtime_pallet_size",
            help: "entire storage size of a pallet, in bytes.",
            labelNames: ["pallet", "item", "chain"]
        })

        registry.registerMetric(this.palletSize);
   
    }

    async init(chainName: string, startingBlockTime: Date, endingBlockTime: Date) {

        await this.clean(chainName.toString(), this.exporterIdenfier, this.exporterVersion,startingBlockTime, endingBlockTime);

    }

    async perBlock(api: ApiPromise, header: Header, chainName: string): Promise<void> {

        const blockNumber = parseInt(header.number.toString());
        const result = await this.doWork(this, api, blockNumber, chainName)
        logger.info(`starting to scrap #${blockNumber} ${chainName} ${this.exporterIdenfier}`);
    }

    async launchWorkers(threadsNumber: number, startingBlock: number, endingBlock: number, chain: string, chainName: string, distanceBB: number) { 
        super.launchWorkers(threadsNumber, startingBlock, endingBlock, chain, this.exporterIdenfier, this.exporterVersion, chainName, distanceBB);
    }

    async perDay(api: ApiPromise, chainName: string) { }

    async perHour(api: ApiPromise, chainName: string) {
        logger.info(`starting per hour scrapping system ${chainName}`)

        for (let pallet of api.runtimeMetadata.asV14.pallets) {
            const storage = pallet.storage.unwrapOrDefault();
            const prefix = storage.prefix;
            for (let item of storage.items) {
                const x = xxhashAsHex(prefix.toString(), 128);
                const y = xxhashAsHex(item.name.toString(), 128);
                const key = `${x}${y.slice(2)}`;
                const size = await api.rpc.state.getStorageSize(key);
                this.palletSize.set({ chain: chainName, pallet: prefix.toString(), item: item.name.toString() }, size.toNumber());
            }
        }
    }
}

export { SystemExporter };


