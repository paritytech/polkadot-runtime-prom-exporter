import * as PromClient from "prom-client"
import { logger } from '../logger';
import { Exporter } from './IExporter';
import { ApiPromise } from "@polkadot/api";
import { Header } from "@polkadot/types/interfaces";
import { Timestamp} from '../workers/timestampWorker'
import { TIMESTAMP_WORKER_PATH } from '../workers/workersPaths'

class TimestampExporter extends Timestamp implements Exporter {
    palletIdentifier: any;
    registry: PromClient.Registry;

    constructor(registry: PromClient.Registry) {
        super(TIMESTAMP_WORKER_PATH, registry, true);
        this.registry = registry;
        this.palletIdentifier = "timestamp";

    }

    async perBlock(api: ApiPromise, header: Header, chainName: string): Promise<void> {

        const blockNumber = parseInt(header.number.toString());
        const result = await this.doWork(this,api,  blockNumber, chainName);

    }

    async launchWorkers(threadsNumber: number, startingBlock: number, endingBlock: number, chain: string) { 
        super.launchWorkers(threadsNumber, startingBlock, endingBlock, chain)

    }

    async perDay(api: ApiPromise, chainName: string) { }

    async perHour(api: ApiPromise, chainName: string) { }


}

export { TimestampExporter };


