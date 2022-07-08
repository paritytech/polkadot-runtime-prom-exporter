import * as PromClient from "prom-client"
import { decimals } from '../index';
import { logger} from '../logger';
import { Exporter } from './IExporter';
import { ApiPromise, WsProvider } from "@polkadot/api";
import { Header } from "@polkadot/types/interfaces";

class StakingMinerAccountExporter implements Exporter {
	palletIdentifier: any;
	balanceA: PromClient.Gauge<"class" | "chain">;
	balanceB: PromClient.Gauge<"class" | "chain">;

	constructor(registry: PromClient.Registry) {
		this.palletIdentifier = "system";

	// balances A
	this.balanceA = new PromClient.Gauge({
		name: "runtime_balance_a",
		help: "balance of a specific account a",
		labelNames: ["type", "chain"]

	})	
	// balances B
	this.balanceB = new PromClient.Gauge({
		name: "runtime_balance_b",
		help: "balance of a specific account b",
		labelNames: ["type", "chain"]
		})	

	registry.registerMetric(this.balanceA);
	registry.registerMetric(this.balanceB);
	
	}

	async perBlock(api: ApiPromise, header: Header, chainName: string): Promise<void> {
	
        try {
			let balanceA = (await api.query.system.account('GtGGqmjQeRt7Q5ggrjmSHsEEfeXUMvPuF8mLun2ApaiotVr'));
			let balanceB = (await api.query.system.account('15S7YtETM31QxYYqubAwRJKRSM4v4Ua6WGFYnx1VuFBnWqdG'));

            if (balanceA.data.free != null) {
			    this.balanceA.set({ chain: chainName },(balanceA.data.free.toBn().div(decimals(api))).toNumber());
            } else {
			    this.balanceA.set({ chain: chainName },0);
            }
            if (balanceB.data.free != null) {
                this.balanceB.set({ chain: chainName },(balanceB.data.free.toBn().div(decimals(api))).toNumber());
            }
            else {
                this.balanceB.set({ chain: chainName },0);
            }
        } catch(error) {
            console.log('error with stakingMinerAccount', error)
            this.balanceA.set({ chain: chainName },0);
            this.balanceB.set({ chain: chainName },0);

        }    
    
    }

	async perDay(api: ApiPromise, chainName: string) {
	
	}

	async perHour(api: ApiPromise, chainName: string) { }
}

export {StakingMinerAccountExporter};