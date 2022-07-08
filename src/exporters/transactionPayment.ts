import * as PromClient from "prom-client"
import { logger } from '../logger';
import { Exporter } from './IExporter';
import { ApiPromise } from "@polkadot/api";
import { Header } from "@polkadot/types/interfaces";
import BN from "bn.js";

class TransactionPaymentExporter implements Exporter {
	palletIdentifier: any;
	weightMultiplierMetric: PromClient.Gauge<"class" | "chain">;

	constructor(registry: PromClient.Registry) {
		this.palletIdentifier = "transactionPayment";

		// transaction payment
		this.weightMultiplierMetric = new PromClient.Gauge({
			name: "runtime_weight_to_fee_multiplier",
			help: "The weight to fee multiplier, in number.",
			labelNames: ["type", "chain"]

		})

		registry.registerMetric(this.weightMultiplierMetric);
	
	}

	async perBlock(api: ApiPromise, header: Header, chainName: string): Promise<void> {
		let weightFeeMultiplier = await api.query.transactionPayment.nextFeeMultiplier()
		this.weightMultiplierMetric.set({ chain: chainName },weightFeeMultiplier.mul(new BN(100)).div(new BN(10).pow(new BN(18))).toNumber())
	
	}

	async perDay(api: ApiPromise, chainName: string) { }
	async perHour(api: ApiPromise, chainName: string) { }
}

export {TransactionPaymentExporter};