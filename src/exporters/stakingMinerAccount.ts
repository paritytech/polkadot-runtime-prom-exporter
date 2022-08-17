import * as PromClient from "prom-client"
import { decimals } from '../utils';
import { logger } from '../logger';
import { Exporter } from './IExporter';
import { ApiPromise, WsProvider } from "@polkadot/api";
import { Header } from "@polkadot/types/interfaces";
import { StakingMinerAccount } from '../workers/stakingMinerAccountWorker'
import { STAKING_MINER_ACCOUNT_WORKER_PATH } from '../workers/workersPaths'

class StakingMinerAccountExporter extends StakingMinerAccount implements Exporter {
    palletIdentifier: any;
    exporterVersion: number;
	exporterIdenfier: string;
    
    registry: PromClient.Registry;
    
    constructor(registry: PromClient.Registry) {
        super(STAKING_MINER_ACCOUNT_WORKER_PATH, registry, true);
        this.registry = registry;
        this.palletIdentifier = "system";
        this.exporterIdenfier = "stakingMinerAccount";
        this.exporterVersion = 1;
    }

    async init(chainName: string, startingBlockTime: Date, endingBlockTime: Date) {

        await this.clean(chainName.toString(), startingBlockTime, endingBlockTime);

    }

    async perBlock(api: ApiPromise, header: Header, chainName: string): Promise<void> {

        const blockNumber = parseInt(header.number.toString());
        const result = await this.doWork(this,api,  blockNumber, chainName)
 
    }

    async perDay(api: ApiPromise, chainName: string) { }

    async perHour(api: ApiPromise, chainName: string) { }
    async launchWorkers(threadsNumber:number, startingBlock: number, endingBlock : number, chain: string, chainName: string, distanceBB: number) {
        super.launchWorkers(threadsNumber, startingBlock, endingBlock, chain, this.exporterIdenfier, this.exporterVersion, chainName, distanceBB);
     }

}

export { StakingMinerAccountExporter };
