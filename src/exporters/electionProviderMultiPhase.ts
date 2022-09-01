import { ApiPromise } from '@polkadot/api';
import { Header, SignedBlock } from '@polkadot/types/interfaces';
import * as PromClient from 'prom-client';
import { decimals } from '../utils';
import { logger } from '../logger';
import { Exporter } from './IExporter';
import { ELECTION_MULT_PHASE_WORKER_PATH } from '../workers/workersPaths';
import { ElectionProviderMultiPhase } from '../workers/electionProviderMultiPhaseWorker';

class ElectionProviderMultiPhaseExporter extends ElectionProviderMultiPhase implements Exporter {
	palletIdentifier: any;
	exporterVersion: number;
	exporterIdentifier: string;
	registry: PromClient.Registry;

	constructor(registry: PromClient.Registry) {
		super(ELECTION_MULT_PHASE_WORKER_PATH, registry, true);
		this.registry = registry;
		this.palletIdentifier = 'electionProviderMultiPhase';
		this.exporterIdentifier = 'electionProviderMultiPhase';

		this.exporterVersion = 1;
	}

	async init(chainName: string, startingBlockTime: Date, endingBlockTime: Date) {
		await this.clean(chainName.toString(), startingBlockTime, endingBlockTime);
	}

	async perBlock(api: ApiPromise, header: Header, chainName: string): Promise<void> {
		const blockNumber = parseInt(header.number.toString());
		const result = await this.doWork(this, api, blockNumber, chainName);
	}

	async perDay(api: ApiPromise, chainName: string) {}

	async perHour(api: ApiPromise, chainName: string) {}

	async launchWorkers(
		threadsNumber: number,
		startingBlock: number,
		endingBlock: number,
		chain: string,
		chainName: string,
		distanceBB: number
	) {
		super.launchWorkers(
			threadsNumber,
			startingBlock,
			endingBlock,
			chain,
			this.exporterIdentifier,
			this.exporterVersion,
			chainName,
			distanceBB
		);
	}
}

export { ElectionProviderMultiPhaseExporter };
