import * as PromClient from 'prom-client';
import { logger } from '../logger';
import { Exporter } from './IExporter';
import { ApiPromise } from '@polkadot/api';
import { Header } from '@polkadot/types/interfaces';
import { TransactionPayments } from '../workers/transactionPaymentsWorker';
import { TRANSACTION_PAYMENTS_WORKER_PATH } from '../workers/workersPaths';

class TransactionPaymentExporter extends TransactionPayments implements Exporter {
	palletIdentifier: any;
	exporterVersion: number;
	exporterIdentifier: string;

	registry: PromClient.Registry;

	constructor(registry: PromClient.Registry) {
		super(TRANSACTION_PAYMENTS_WORKER_PATH, registry, true);
		this.registry = registry;
		this.palletIdentifier = 'transactionPayment';
		this.exporterIdentifier = 'transactionPayment';
		this.exporterVersion = 1;
	}

	async init(chainName: string, startingBlockTime: Date, endingBlockTime: Date) {
		await this.clean(chainName.toString(), startingBlockTime, endingBlockTime);
	}

	async perBlock(api: ApiPromise, header: Header, chainName: string): Promise<void> {
		const blockNumber = parseInt(header.number.toString());
		const result = await this.doWork(this, api, blockNumber, chainName);
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

	async perDay(api: ApiPromise, chainName: string) {}
	async perHour(api: ApiPromise, chainName: string) {}
}

export { TransactionPaymentExporter };
