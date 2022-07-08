import * as PromClient from "prom-client"
import { logger} from '../logger';
import { Exporter } from './IExporter';
import { ApiPromise } from "@polkadot/api";
import { Header, SignedBlock } from "@polkadot/types/interfaces";
import { xxhashAsHex } from "@polkadot/util-crypto";

 let allSectionMethods = new Map<string, [number, boolean, string]>();

 class PalletsMethodsExporter implements Exporter {
	palletIdentifier: any;
	methodsCallsMetric: PromClient.Gauge< "chain" | "section"| "method" | "type">

	constructor(registry: PromClient.Registry) {

		registry.setDefaultLabels({
			app: 'runtime-metrics'
		})

		this.palletIdentifier = "system";

		this.methodsCallsMetric = new PromClient.Gauge({
			name: "runtime_section_method_calls_per_block",
			help: "number of methods calls per block provided with section",
			labelNames: ["chain", "section", "method", "type"] 
		})

		registry.registerMetric(this.methodsCallsMetric);

	}

	async perBlock(api: ApiPromise, header: Header, chainName: string): Promise<void> {

		const block = await api.rpc.chain.getBlock(header.hash);
		let number = header.number;
		const [ timestamp, signed_block] = await Promise.all([
			api.query.timestamp.now(),
			api.rpc.chain.getBlock(header.hash)
		]);

		let sectionMethods = new Map<string, [number,boolean,string]>();

		//initiate to 0 all the methods that were called in the previous block
		for (let entry of allSectionMethods.entries()) {
			const [count, issigned, mymethod]: [number, boolean, string]  = entry[1] || [0,false, '' ];
			sectionMethods.set(entry[0], [0, issigned, mymethod]);
		}
		
		allSectionMethods.clear();

		signed_block.block.extrinsics.forEach((ex, index) => {
			const { isSigned, meta,method: { args, method, section } } = ex;
			let signer = ex.signer.toString();
			let sectionMethod = section+'.'+method;
			const [count, issigned, mymethod]: [number,boolean, string]  = sectionMethods.get(sectionMethod) || [0,isSigned,method];
			sectionMethods.set(sectionMethod, [count+1, issigned, mymethod]);
		});

		for (let entry of sectionMethods.entries()) {
			const [count, sign, method]: [number,boolean, string]  = entry[1] || [0,false,''];
			let sectionName = (entry[0]).split('.');
			this.methodsCallsMetric.set({ section: (entry[0]).split('.')[0], type: sign? 'signed':'unsigned', method : method, chain: chainName}, count);
			allSectionMethods.set(entry[0], [count, sign, method]);
		}

		logger.debug('allSectionMethods.size',allSectionMethods.size);

	}

	async perDay(api: ApiPromise, chainName: string) { }
	async perHour(api: ApiPromise, chainName: string) { }

}

export { PalletsMethodsExporter };

