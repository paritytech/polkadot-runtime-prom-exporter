import { ApiPromise, WsProvider } from "@polkadot/api";
import "@polkadot/api-augment";
import * as PromClient from "prom-client"
import * as http from "http";
import { config } from "dotenv";
import BN from "bn.js";
import { ApiDecoration } from "@polkadot/api/types";
import { SystemExporter } from "./exporters/system";
import { BalancesExporter } from "./exporters/balances";
import { XCMTransfersExporter } from "./exporters/xcmTransfers";
import { StakingMinerAccountExporter } from "./exporters/stakingMinerAccount";
import { TransactionPaymentExporter } from "./exporters/transactionPayment";
import { StakingExporter } from "./exporters/staking";
import { PalletsMethodsExporter } from "./exporters/palletsMethodsCalls";
import { ElectionProviderMultiPhaseExporter } from "./exporters/electionProviderMultiPhase";
import { TimestampExporter } from "./exporters/timestamp";

import { logger } from "./logger";

import parachains_load_history from './parachains_load_history.json'
import parachains from "./parachains.json";
import parachainsids from "./parachains-ids.json";

config();

export const useTSDB  = (process.env.TSDB_CONN  != "") ? true : false;
// 30 mins, instead of the default 1min.
export const DEFAULT_TIMEOUT = 30 * 60 * 1000;
//number of threads to run per parachain historical loading 
const THREADS = 40;

const express = require('express');
const app = express()
const port = 3000;

export function getParachainName(mykey: string): string {
	for (const [key, value] of Object.entries(parachainsids)) {
		if (mykey == key) {
			return value;
		}
	}
	return mykey;
}


export function getParachainLoadHistoryParams(chain: string) {

	let i=0;
	for (const [key, value] of Object.entries(parachains_load_history)) {

		if (chain == value[i].chain) {
			const startingBlock = (value[i].startingBlock);
			const endingBlock = value[i].endingBlock;
			
			if ((startingBlock-endingBlock)%100 !=0) {
				logger.debug(`ERROR!, exit, (starting block - ending block) must be multiple of 100 in parachains_load_history.json`);
				return [0,0] as const;
			}
			logger.debug(`loading historical data for chain ${value[i].chain}, starting block: ${startingBlock} , ending: ${endingBlock}`);
			return [startingBlock, endingBlock] as const;
		}
		i++;
	}
	logger.debug(`no parachain settings for chain ${chain} parachains_load_history.json`);
	return [0,0] as const;

}

export async function getFinalizedApi(api: ApiPromise): Promise<ApiDecoration<"promise">> {
	const finalized = await api.rpc.chain.getFinalizedHead();
	return await api.at(finalized)
}

const PORT = process.env.PORT || 8080;

console.log(`+ PORT = ${PORT}`)

const SECONDS = 1000;
const MINUTES = 60 * SECONDS;
const HOURS = 60 * MINUTES;

// TODO: total number of accounts
// TODO: counter of bag nodes matching
// TODO: pools: TVL, num pools, num-members, points to balance-ratio of each pool

const registry = new PromClient.Registry();
registry.setDefaultLabels({
	app: 'runtime-metrics'
})

export function decimals(api: ApiDecoration<"promise">): BN {
	try {
		return new BN(Math.pow(10, api.registry.chainDecimals[0]))
	}
	catch (error) {
		console.log('function decimals error', error)
		return new BN(0);
	}
}

async function main() {

	try {

		if (parachains.length) {
			const exporters = [new SystemExporter(registry),
			new StakingExporter(registry),
			new BalancesExporter(registry),
			new TransactionPaymentExporter(registry),
			new StakingMinerAccountExporter(registry),
			new ElectionProviderMultiPhaseExporter(registry),
			new TimestampExporter(registry),
			new XCMTransfersExporter(registry),
			new PalletsMethodsExporter(registry),
			]

			for (let chain of parachains) {
				logger.info(`connecting to chain ${chain}`);
				const provider = new WsProvider(chain, 1000, {}, DEFAULT_TIMEOUT);
				const api = await ApiPromise.create({ provider });
				const chainName = await api.rpc.system.chain();
				let [startingBlock,endingBlock] = getParachainLoadHistoryParams(chain.toString())
				startingBlock = startingBlock.valueOf();
				endingBlock = endingBlock.valueOf();

				// TODO: all of the async operations could potentially be double-checked for sensibility,
				// and improved. Also, more things can be parallelized here with Promise.all.
				for (let exporter of exporters) {
					logger.info(`connecting ${chain} to pallet ${exporter.palletIdentifier}`);
					if (api.query[exporter.palletIdentifier]) {
						logger.info(`registering ${exporter.palletIdentifier} exporter for chain ${chainName}`);
						if (startingBlock != 0 ) {
							logger.info(`loading history for ${exporter.palletIdentifier} exporter for chain ${chainName}`);
							const loadArchive = exporter.doLoadHistory(THREADS,startingBlock , endingBlock , chain.toString()) 
						}		

						const _perHour = setInterval(() => exporter.perHour(api, chainName.toString()), 1 * MINUTES);
						const _perDay = setInterval(() => exporter.perDay(api, chainName.toString()), 24 * HOURS);
						const _perBlock = await api.rpc.chain.subscribeFinalizedHeads((header) => exporter.perBlock(api, header, chainName.toString()));
					} else {
						logger.info(`Pallet ${exporter.palletIdentifier} not supported for chain ${chainName}`);
					}
				}
			}
		}
		else {
			logger.info(`parachains.json file is empty, please add at least one rpc address:\n
			Example: ["wss://kusama-runtime-exporter-node.parity-chains.parity.io",
					wss://polkadot-runtime-exporter-node.parity-chains.parity.io"]\n`);
			process.exit();
		}
	} catch (error) {
		logger.debug(`error from main function ${error}`);
	}
}

const server = http.createServer(async (req, res) => {
	if (req.url === "/metrics") {
		// Return all metrics the Prometheus exposition format
		res.setHeader('Content-Type', registry.contentType)
		res.end(await registry.metrics())
	} else {
		res.setHeader('Content-Type', 'text/html');
		res.end(`
<!doctype html>
<html lang="en">

<head>
    <title>Moooo?</title>
</head>

<body>
<pre>
/ You are only young once, but you can  \
\ stay immature indefinitely.           /
----------------------------------------
       \   ^__^
        \  (oo)\_______
           (__)\       )\/\
               ||----w |
               ||     ||
</pre>
</body>

</html>
		`)
	}
})

// @ts-ignore
server.listen(PORT, "0.0.0.0");
console.log(`Server listening on port ${PORT}`)

main().then().catch(console.error);
