import * as PromClient from "prom-client"
import { logger } from '../logger';
import { Exporter } from './IExporter';
import { Header } from "@polkadot/types/interfaces";
import { NominationPools } from '../workers/NominationPoolsWorker'
import { NOMINATION_POOLS_WORKER_PATH } from '../workers/workersPaths'
import '@polkadot/api-augment';
import { ApiPromise } from '@polkadot/api';

const { stringToU8a } = require('@polkadot/util');

class NominationPoolsExporter extends NominationPools implements Exporter {
	palletIdentifier: any;
	exporterVersion: number;
	exporterIdenfier: string;
	registry: PromClient.Registry;

	constructor(registry: PromClient.Registry) {
		//worker needs .js 
		super(NOMINATION_POOLS_WORKER_PATH, registry, true);
		this.registry = registry;
		this.palletIdentifier = "nominationPools";
		this.exporterIdenfier = "nominationPools";
		this.exporterVersion = 1;
	}

	async perBlock(api: ApiPromise, header: Header, chainName: string): Promise<void> {

		const blockNumber = parseInt(header.number.toString());
		const result = await this.doWork(this, api, blockNumber, chainName)
	}

	async perDay(api: ApiPromise, chainName: string) { }

	async perHour(api: ApiPromise, chainName: string) { }

	async init(chainName: string, startingBlockTime: Date, endingBlockTime: Date) {
		await this.clean(chainName.toString(), startingBlockTime, endingBlockTime);
	}

	async launchWorkers(threadsNumber: number, startingBlock: number, endingBlock: number, chain: string, chainName: string) {
		super.launchWorkers(threadsNumber, startingBlock, endingBlock, chain, this.exporterIdenfier, this.exporterVersion, chainName)
	}

}

export { NominationPoolsExporter };
