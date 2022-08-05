import * as PromClient from "prom-client"
import { logger } from '../logger';
import { Exporter } from './IExporter';
import { ApiPromise } from "@polkadot/api";
import { Header } from "@polkadot/types/interfaces";
import { TransactionPayments } from '../workers/transactionPaymentsWorker'
import { TRANSACTION_PAYMENTS_WORKER_PATH } from '../workers/workersPaths'

class TransactionPaymentExporter extends TransactionPayments implements Exporter {
    palletIdentifier: any;
    registry: PromClient.Registry;

    constructor(registry: PromClient.Registry) {
        super(TRANSACTION_PAYMENTS_WORKER_PATH, registry, true);
        this.registry = registry;
        this.palletIdentifier = "transactionPayment";
    }

    async init(api: ApiPromise, chainName: string, startingBlockTime: Date, endingBlockTime: Date) {

        await this.clean(api, chainName.toString(), startingBlockTime, endingBlockTime);

    }

    async perBlock(api: ApiPromise, header: Header, chainName: string): Promise<void> {
        const blockNumber = parseInt(header.number.toString());
        const result = await this.doWork(this, api, blockNumber, chainName)
    }

    async launchWorkers(threadsNumber: number, startingBlock: number, endingBlock: number, chain: string) {
        super.launchWorkers(threadsNumber, startingBlock, endingBlock, chain)
    }

    async perDay(api: ApiPromise, chainName: string) { }
    async perHour(api: ApiPromise, chainName: string) { }
}

export { TransactionPaymentExporter };
