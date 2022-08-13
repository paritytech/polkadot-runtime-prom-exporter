import { ApiPromise, WsProvider } from "@polkadot/api";
import "@polkadot/api-augment";
import * as PromClient from "prom-client"
import * as http from "http";
import { config } from "dotenv";
import { SystemExporter, BalancesExporter, XCMTransfersExporter, StakingMinerAccountExporter, TransactionPaymentExporter, StakingExporter, PalletsMethodsExporter, ElectionProviderMultiPhaseExporter, TimestampExporter, NominationPoolsExporter } from "./exporters";
import { getParachainLoadHistoryParams } from './utils';
import { logger } from "./logger";
import parachains from "./parachains.json";
import { DEFAULT_TIMEOUT, getTimeOfBlock, isPalletRequiredByHistoryConfig } from './utils'

config();

//number of threads to run per parachain historical loading 
const THREADS = 2;

logger.debug(`Threads per exporter ${THREADS}`);

const PORT = process.env.PORT || 8080;

const SECONDS = 1000;
const MINUTES = 60 * SECONDS;
const HOURS = 60 * MINUTES;

// TODO: total number of accounts
// TODO: pools: TVL, num pools, num-members, points to balance-ratio of each pool

const registry = new PromClient.Registry();
registry.setDefaultLabels({
	app: 'runtime-metrics'
})

async function main() {

	try {

		const useTSDB = (process.env.TSDB_CONN != "") ? true : false;

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
			new NominationPoolsExporter(registry),
			]

			for (let chain of parachains) {
				logger.info(`connecting to chain ${chain}`);
				const provider = new WsProvider(chain, 1000, {}, DEFAULT_TIMEOUT);
				const api = await ApiPromise.create({ provider });
				const chainName = await (await api.rpc.system.chain()).toString();

				let [startingBlock, endingBlock, pallets] = getParachainLoadHistoryParams(chain.toString())
				startingBlock = startingBlock.valueOf();
				endingBlock = endingBlock.valueOf();
				const palletsArr = pallets.split(',');

				const startingBlockHash = await api.rpc.chain.getBlockHash(startingBlock);
				var startDate = await getTimeOfBlock(api, startingBlockHash.toString());

				const endingingBlockHash = await api.rpc.chain.getBlockHash(endingBlock);
				const endDate = await getTimeOfBlock(api, endingingBlockHash.toString())

				for (let exporter of exporters) {
					logger.info(`connecting ${chain} to pallet ${exporter.palletIdentifier}`);

					if (api.query[exporter.palletIdentifier]) {
						logger.info(`registering ${exporter.palletIdentifier} exporter for chain ${chainName}`);
						if ((startingBlock != 0) && useTSDB && isPalletRequiredByHistoryConfig(palletsArr, exporter.palletIdentifier)) {

							logger.info(`checking upgrade for ${exporter.exporterIdenfier} exporter for chain ${chainName}`);

							let historyRecords = new Map<string, [number, number, number]>();
							historyRecords = await exporter.getExportersVersionsRecords(chainName.toString(), exporter.exporterIdenfier, exporter.exporterVersion);

							//checks current version against version of exporters stored in exporters_versions table and run history again for new exporters only
							for (let entry of historyRecords.entries()) {
								const [startingBlock, endingBlock, version]: [number, number, number] = entry[1] || [0, 0, 0];
								if ((exporter.exporterVersion > version) && (version != 0)) {
									const startingBlockHash = await api.rpc.chain.getBlockHash(startingBlock);
									var startDate = await getTimeOfBlock(api, startingBlockHash.toString());
									const endingingBlockHash = await api.rpc.chain.getBlockHash(endingBlock);
									const endDate = await getTimeOfBlock(api, endingingBlockHash.toString())
								
									logger.info(`going to clean and reload history because new exporter version was found for ${exporter.exporterIdenfier} chain ${chainName}, version ${exporter.exporterVersion} start at #${startingBlock} end at #${endingBlock}`);
									const result = await exporter.init(chainName.toString(), startDate, endDate);
									const loadArchive = exporter.launchWorkers(THREADS, startingBlock, endingBlock, chain.toString(), chainName.toString())
								}
							}

							//load history only if there is no record in exporters_versions table for the same version, startingBlock and endingBlock
							const checkIfExists = await exporter.findExporterRecord(chainName.toString(), exporter.exporterIdenfier, exporter.exporterVersion, startingBlock, endingBlock);
							if (checkIfExists == false) {
								//clean data for the segments of time defined in parachains_load_history 
								logger.info(`clean data and load history for exporter ${exporter.exporterIdenfier} for chain ${chainName}, version ${exporter.exporterVersion} start at #${startingBlock} end at #${endingBlock}`);
								const result = await exporter.init(chainName.toString(), startDate, endDate);
								const loadArchive = exporter.launchWorkers(THREADS, startingBlock, endingBlock, chain.toString(), chainName.toString())
						
							}
							else {
								logger.info(`skip load for exporter ${exporter.exporterIdenfier}, chain ${chainName} - historical data already stored for version ${exporter.exporterVersion} start at #${startingBlock} end at #${endingBlock}`);
							}
						}
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
	} catch (error) {
		logger.debug(`error from main function ${error}`);
	}
}

try {

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
	logger.debug(`Server listening on port ${PORT}`);
}
catch (error) {
	logger.debug(`Server already listening on port ${PORT}`);
}

main().then().catch(console.error);
