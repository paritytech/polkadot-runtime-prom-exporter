import { ApiPromise, WsProvider } from "@polkadot/api";
import "@polkadot/api-augment";
import * as PromClient from "prom-client"
import * as http from "http";
import { config } from "dotenv";
import BN from "bn.js";
import { ApiDecoration } from "@polkadot/api/types";
import parachains from "./parachains.json";
import parachainsids from "./parachains-ids.json";
import { exit } from "process";
import {SystemExporter} from "./exporters/system";
import {BalancesExporter} from "./exporters/balances";
import {XCMTransfersExporter} from "./exporters/xcmTransfers";
import {StakingMinerAccountExporter} from "./exporters/stakingMinerAccount";
import {TransactionPaymentExporter} from "./exporters/transactionPayment";
import {StakingExporter} from "./exporters/staking";
import {PalletsMethodsExporter} from "./exporters/palletsMethodsCalls";
import {logger} from "./logger";

config();

// 30 mins, instead of the default 1min.
const DEFAULT_TIMEOUT = 30 * 60 * 1000;

export function getParachainName(mykey: string): string {
	for (const [key, value] of Object.entries(parachainsids)) {
		if (mykey == key) {
			return value;
		}
	}
	return mykey;
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

// TODO: histogram of calls
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
		console.log('function decimals error',error)
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
							new XCMTransfersExporter(registry),
							new PalletsMethodsExporter(registry),
						]

				for (let chain of parachains) {
					logger.info(`connecting to chain ${chain}`);
					const provider = new WsProvider(chain, 1000, {}, DEFAULT_TIMEOUT);
					const api = await ApiPromise.create({ provider });
					const chainName = await api.rpc.system.chain();
					
					// TODO: all of the async operations could potentially be double-checked for sensibility,
					// and improved. Also, more things can be parallelized here with Promise.all.
					for (let exporter of exporters) {
						logger.info(`connecting ${chain} to pallet ${exporter.palletIdentifier}`);
						if ( api.query[exporter.palletIdentifier]) {
							logger.info(`registering ${exporter.palletIdentifier} exporter for chain ${chainName}`);
							const _perHour = setInterval(() => exporter.perHour(api, chainName.toString()), 60 * MINUTES);
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
	} catch(error) {
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
