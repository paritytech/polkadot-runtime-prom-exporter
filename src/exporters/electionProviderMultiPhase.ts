import { ApiPromise } from "@polkadot/api";
import { Header, SignedBlock } from "@polkadot/types/interfaces";
import * as PromClient from "prom-client";
import { decimals } from '../utils';
import { logger } from '../logger';
import { Exporter } from './IExporter';
import { ELECTION_MULT_PHASE_WORKER_PATH } from '../workers/workersPaths'
import { ElectionProviderMultiPhase } from '../workers/electionProviderMultiPhaseWorker'

class ElectionProviderMultiPhaseExporter extends ElectionProviderMultiPhase implements Exporter {
    palletIdentifier: any;
    registry: PromClient.Registry;

    constructor(registry: PromClient.Registry) {
        super(ELECTION_MULT_PHASE_WORKER_PATH, registry, true);
        this.registry = registry;
        this.palletIdentifier = "electionProviderMultiPhase";

    }

    async init(api: ApiPromise, chainName: string, startingBlockTime: Date, endingBlockTime: Date) {

        await this.clean(api, chainName.toString(), startingBlockTime, endingBlockTime);

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

export { ElectionProviderMultiPhaseExporter };
