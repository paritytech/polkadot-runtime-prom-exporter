import * as PromClient from "prom-client"
import { logger } from '../logger';
import { Exporter } from './IExporter';
import { ApiPromise } from "@polkadot/api";
import { Header } from "@polkadot/types/interfaces";
import { Timestamp } from '../workers/timestampWorker'
import { TIMESTAMP_WORKER_PATH } from '../workers/workersPaths'

class TimestampExporter extends Timestamp implements Exporter {
    palletIdentifier: any;
    exporterVersion: number;
	exporterIdenfier: string;
    
    registry: PromClient.Registry;

    constructor(registry: PromClient.Registry) {
        super(TIMESTAMP_WORKER_PATH, registry, true);
        this.registry = registry;
        this.palletIdentifier = "timestamp";
        this.exporterIdenfier = "timestamp";
        this.exporterVersion = 1;
    }

    async init(chainName: string, startingBlockTime: Date, endingBlockTime: Date) {

        await this.clean(chainName.toString(), startingBlockTime, endingBlockTime);

    }

    async perBlock(api: ApiPromise, header: Header, chainName: string): Promise<void> {

        const blockNumber = parseInt(header.number.toString());
        const result = await this.doWork(this, api, blockNumber, chainName);

    }

    async launchWorkers(threadsNumber: number, startingBlock: number, endingBlock: number, chain: string, chainName: string, distanceBB: number) {
        super.launchWorkers(threadsNumber, startingBlock, endingBlock, chain, this.exporterIdenfier, this.exporterVersion, chainName, distanceBB)

    }

    async perDay(api: ApiPromise, chainName: string) { }

    async perHour(api: ApiPromise, chainName: string) { }


}

export { TimestampExporter };


