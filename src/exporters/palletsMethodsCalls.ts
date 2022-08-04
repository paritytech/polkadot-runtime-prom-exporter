import * as PromClient from "prom-client"
import { logger } from '../logger';
import { Exporter } from './IExporter';
import { ApiPromise } from "@polkadot/api";
import { Header } from "@polkadot/types/interfaces";
import { PalletMethods } from '../workers/palletMethodsCallsWorker'
import { PALLETSMETHODS_WORKER_PATH } from '../workers/workersPaths'

class PalletsMethodsExporter extends PalletMethods implements Exporter {
    palletIdentifier: any;

    constructor(registry: PromClient.Registry) {
        //worker needs .js 
        super(PALLETSMETHODS_WORKER_PATH, registry, true);
        this.registry = registry;
        this.palletIdentifier = "xcmPallet";

    }

    async perBlock(api: ApiPromise, header: Header, chainName: string): Promise<void> {

        const blockNumber = parseInt(header.number.toString());
        const result = await this.doWork(this, api, blockNumber, chainName)

    }

    async perDay(api: ApiPromise, chainName: string) { }

    async perHour(api: ApiPromise, chainName: string) { }

    async launchWorkers(threadsNumber: number, startingBlock: number, endingBlock: number, chain: string) {
        super.launchWorkers(threadsNumber, startingBlock, endingBlock, chain)
    }

}

export { PalletsMethodsExporter };


