import * as PromClient from "prom-client"
import { decimals } from '../index';
import { logger } from '../logger';

import { Exporter } from './IExporter';
import { ApiPromise, WsProvider } from "@polkadot/api";
import { Header } from "@polkadot/types/interfaces";

class BalancesExporter implements Exporter {
    palletIdentifier: any;
    totalIssuanceMetric: PromClient.Gauge<"class" | "chain">;

    constructor(registry: PromClient.Registry) {
        this.palletIdentifier = "balances";

        // balances
        this.totalIssuanceMetric = new PromClient.Gauge({
            name: "runtime_total_issuance",
            help: "the total issuance of the runtime, updated per block",
            labelNames: ["type", "chain"]

        })

        registry.registerMetric(this.totalIssuanceMetric);

    }

    async perBlock(api: ApiPromise, header: Header, chainName: string): Promise<void> {
        // update issuance

        try {
            let issuance = (await api.query.balances.totalIssuance()).toBn();
            let issuancesScaled = issuance.div(decimals(api));
            //	console.log('issuance', issuance,  'issuancesScaled',issuancesScaled, issuancesScaled.toNumber() )
            this.totalIssuanceMetric.set({ chain: chainName }, issuancesScaled.toNumber());

        } catch (error) {
            console.log('perBlock BalanceExporter error for chain', chainName, error)

        }
    }

    async perDay(api: ApiPromise, chainName: string) { }

    async perHour(api: ApiPromise, chainName: string) { }

    async doLoadHistory(threadsNumber:number, startingBlock: number, endingBlock: number, chain: string) { }

}

export { BalancesExporter };

