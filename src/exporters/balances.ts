import * as PromClient from "prom-client"
import { logger } from '../logger';
import { Exporter } from './IExporter';
import { ApiPromise } from "@polkadot/api";
import { Header } from "@polkadot/types/interfaces";
import { Balances } from '../workers/balancesWorker'
import { BALANCE_WORKER_PATH } from '../workers/workersPaths'

const Sequelize = require('sequelize');

class BalancesExporter extends Balances implements Exporter {
    palletIdentifier: any;
    registry: PromClient.Registry;

    constructor(registry: PromClient.Registry) {
        //worker needs .js 
        super(BALANCE_WORKER_PATH, registry, true);
        this.registry = registry;
        this.palletIdentifier = "balances";
    }

    async perBlock(api: ApiPromise, header: Header, chainName: string): Promise<void> {

        const blockNumber = parseInt(header.number.toString());
        const result = await this.doWork(this, api, blockNumber, chainName)

    }

    async perDay(api: ApiPromise, chainName: string) { }

    async perHour(api: ApiPromise, chainName: string) { }

    async init(api: ApiPromise, chainName: string, startingBlockTime: Date, endingBlockTime: Date) { 
        await this.clean( api, chainName.toString(), startingBlockTime, endingBlockTime);
    }

    async launchWorkers(threadsNumber: number, startingBlock: number, endingBlock: number, chain: string) {
        super.launchWorkers(threadsNumber, startingBlock, endingBlock, chain)
    }

}

export { BalancesExporter };

