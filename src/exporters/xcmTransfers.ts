import * as PromClient from "prom-client"
import { getParachainName, decimals } from '../index';
import { logger } from '../logger';
import { Exporter } from './IExporter';
import { ApiPromise } from "@polkadot/api";
import { Header } from "@polkadot/types/interfaces";

class XCMTransfersExporter implements Exporter {
    palletIdentifier: any;
    xcmTransfers: PromClient.Gauge<"chain" | "tochain">

    constructor(registry: PromClient.Registry) {
        this.palletIdentifier = "system";

        this.xcmTransfers = new PromClient.Gauge({
            name: "runtime_xcm_transfers",
            help: "Total of XCM transfers.",
            labelNames: ["chain", "tochain"]
        })

        registry.registerMetric(this.xcmTransfers);
    }

    async perBlock(api: ApiPromise, header: Header, chainName: string): Promise<void> {

        const block = await api.rpc.chain.getBlock(header.hash);
        const signedLength = block.block.extrinsics.filter((ext) => ext.isSigned).length
        const unsignedLength = block.block.extrinsics.length - signedLength;
        let number = header.number;
        const [timestamp, signed_block] = await Promise.all([
            api.query.timestamp.now(),
            api.rpc.chain.getBlock(header.hash)
        ]);

        signed_block.block.extrinsics.forEach((ex, index) => {
            const { isSigned, meta, method: { args, method, section } } = ex;

            if (section == 'xcmPallet') {
                const obj = JSON.parse(ex.toString());

                let paraChainName = "";
                let transferAmount = 0.0;

                console.log('chain', chainName, index, ex.toString());
                console.log(`${section}.${method}(${args.map((a) => a.toString()).join(',\n ')})`);

                try {
                    paraChainName = getParachainName(obj.method.args.dest.v1.interior.x1.parachain);
                } catch (error) {
                    try {
                        paraChainName = getParachainName(obj.method.args.dest.v0.x1.parachain);
                    } catch (error) {
                        console.log('error with parachain ', error)
                    }
                }
                console.log('PARACHAIN : ', paraChainName)

                try {
                    let myAmount = ((obj.method.args.assets.v1[0].fun.fungible) / (decimals(api).toNumber())).toFixed(2);;
                    transferAmount = parseFloat(myAmount);
                } catch (error) {
                    try {
                        let myAmount = ((obj.method.args.assets.v0[0].concreteFungible.amount) / (decimals(api).toNumber())).toFixed(2);;
                        transferAmount = parseFloat(myAmount);
                    } catch (error) {
                        console.log('error with amount ', error)
                    }
                }

                console.log('READABLE AMOUNT : ', transferAmount)
                this.xcmTransfers.set({ tochain: paraChainName, chain: chainName }, transferAmount);
            }

        });
    }

    async perDay(api: ApiPromise, chainName: string) { }
    async perHour(api: ApiPromise, chainName: string) { }
    async doLoadHistory(threadsNumber:number, startingBlock: number, endingBlock : number, chain: string) { }

}

export { XCMTransfersExporter };