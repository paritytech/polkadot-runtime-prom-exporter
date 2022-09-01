import * as PromClient from "prom-client"
import { logger } from '../logger';
import { Exporter } from './IExporter';
import { ApiPromise } from "@polkadot/api";
import { Header } from "@polkadot/types/interfaces";
import { Balances } from '../workers/balancesWorker'
import { BALANCE_WORKER_PATH } from '../workers/workersPaths'

class BalancesExporter extends Balances implements Exporter {
    palletIdentifier: any;
    exporterVersion: number;
	exporterIdenfier: string;
    
    registry: PromClient.Registry;

    constructor(registry: PromClient.Registry) {
        //worker needs .js 
        //we set to true withProm, meaning that the real time  metric will be stored on prometheus
        super(BALANCE_WORKER_PATH, registry, true);
        this.registry = registry;
        this.palletIdentifier = "balances";
        this.exporterIdenfier = "balances";
        this.exporterVersion = 1;
        
    }

    async perBlock(api: ApiPromise, header: Header, chainName: string): Promise<void> {

        const blockNumber = parseInt(header.number.toString());
        const result = await this.doWork(this, api, blockNumber, chainName)

    }

    async perDay(api: ApiPromise, chainName: string) { }

    async perHour(api: ApiPromise, chainName: string) { }

    async init(chainName: string, startingBlockTime: Date, endingBlockTime: Date) { 
       
        await this.clean(  chainName.toString(), startingBlockTime, endingBlockTime);
    }

    async launchWorkers(threadsNumber: number, startingBlock: number, endingBlock: number, chain: string, chainName: string, distanceBB: number) {
        super.launchWorkers(threadsNumber, startingBlock, endingBlock, chain, this.exporterIdenfier, this.exporterVersion, chainName,distanceBB)
    }

}

export { BalancesExporter };