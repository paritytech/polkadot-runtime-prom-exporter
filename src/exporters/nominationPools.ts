import '@polkadot/api-augment';
import * as PromClient from 'prom-client';
import { Exporter } from './IExporter';
import { Header } from '@polkadot/types/interfaces';
import { NominationPools } from '../workers/nominationPoolsWorker';
import { NOMINATION_POOLS_WORKER_PATH } from '../workers/workersPaths';
import { ApiPromise } from '@polkadot/api';

class NominationPoolsExporter extends NominationPools implements Exporter {
	palletIdentifier: any;
	exporterVersion: number;
	exporterIdentifier: string;
	registry: PromClient.Registry;

	constructor(registry: PromClient.Registry) {
		//worker needs .js
		super(NOMINATION_POOLS_WORKER_PATH, registry, true);
		this.registry = registry;
		this.palletIdentifier = 'nominationPools';
		this.exporterIdentifier = 'nominationPools';
		this.exporterVersion = 1;
	}

	async perBlock(api: ApiPromise, header: Header, chainName: string): Promise<void> {
		const blockNumber = parseInt(header.number.toString());
		const result = await this.doWork(this, api, blockNumber, chainName);
	}

	async perDay(api: ApiPromise, chainName: string) {}

	async perHour(api: ApiPromise, chainName: string) {}

	async init(chainName: string, startingBlockTime: Date, endingBlockTime: Date) {
		await this.clean(chainName.toString(), startingBlockTime, endingBlockTime);
	}

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

export { NominationPoolsExporter };
