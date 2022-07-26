import * as PromClient from "prom-client"
import { logger } from '../logger';
import { Exporter } from './IExporter';
import { ApiPromise } from "@polkadot/api";
import { Header } from "@polkadot/types/interfaces";
import { xxhashAsHex } from "@polkadot/util-crypto";

class TimestampExporter implements Exporter {
    palletIdentifier: any;
 
    //timestamp
    timestampMetric: PromClient.Gauge<"pallet" | "chain">
   
    constructor(registry: PromClient.Registry) {

        registry.setDefaultLabels({
            app: 'runtime-metrics'
        })

        this.palletIdentifier = "system";

        // timestamp
        this.timestampMetric = new PromClient.Gauge({
            name: "runtime_timestamp_seconds",
            help: "timestamp of the block.",
        })

    }

    async perBlock(api: ApiPromise, header: Header, chainName: string): Promise<void> {

     
        const [timestamp] = await Promise.all([
            api.query.timestamp.now()
        ]);
        this.timestampMetric.set(timestamp.toNumber() / 1000);

    }

    async doLoadHistory(threadsNumber:number, startingBlock: number, endingBlock : number, chain: string) { }

    async perDay(api: ApiPromise, chainName: string) { }

    async perHour(api: ApiPromise, chainName: string) { }

 
}

export { TimestampExporter };


