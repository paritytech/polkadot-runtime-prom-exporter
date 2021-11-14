import { ApiPromise, WsProvider } from "@polkadot/api";
import { Header, SignedBlock } from "@polkadot/types/interfaces";
import { StorageEntryMetadataV14 } from "@polkadot/types/interfaces";
import * as PromClient from "prom-client"
import * as http from "http";
import { config } from "dotenv";
import BN from "bn.js";
import { xxhashAsHex } from "@polkadot/util-crypto";
import * as winston from 'winston'
config();

export const logger = winston.createLogger({
	level: process.env.LOG_LEVEL || 'debug',
	format: winston.format.combine(
		winston.format.colorize(),
		winston.format.colorize({
		}),
		winston.format.timestamp({
			format: 'YY-MM-DD HH:MM:SS'
		}),
		winston.format.printf(
			(info) => `[${info.timestamp}] ${info.level}: ${info.message}`
		)
	),
	transports: [new winston.transports.Console()]
})


const WS_PROVIDER = process.env.WS_PROVIDER || "ws://localhost:9944";
const PORT = process.env.PORT || 8080;

console.log(`+ WS_PROVIDER = ${WS_PROVIDER}`)
console.log(`+ PORT = ${PORT}`)

const SECONDS = 1000;
const MINUTES = 60 * SECONDS;
const HOURS = 60 * MINUTES;
const DAYS = 24 * HOURS;

// TODO: histogram of calls
// TODO: total number of accounts

const registry = new PromClient.Registry();
registry.setDefaultLabels({
	app: 'runtime-metrics'
})

const finalizedHeadMetric = new PromClient.Gauge({
	name: "chain_finalized_number",
	help: "finalized head of the chain."
})

const weightMetric = new PromClient.Gauge({
	name: "runtime_weight",
	help: "weight of the block; labeled by dispatch class.",
	labelNames: ["class"]
})

const timestampMetric = new PromClient.Gauge({
	name: "runtime_timestamp_seconds",
	help: "timestamp of the block.",
})

const blockLengthMetric = new PromClient.Gauge({
	name: "runtime_block_length_bytes",
	help: "encoded length of the block in bytes.",
})

const numExtrinsicsMetric = new PromClient.Gauge({
	name: "runtime_extrinsics_count",
	help: "number of extrinsics in the block, labeled by signature type.",
	labelNames: ["type"]
})

const totalIssuanceMetric = new PromClient.Gauge({
	name: "runtime_total_issuance",
	help: "the total issuance of the runtime, updated per block",
})

const nominatorCountMetric = new PromClient.Gauge({
	name: "runtime_nominator_count",
	help: "Total number of nominators in staking system",
	labelNames: ["type"],
})

const validatorCountMetric = new PromClient.Gauge({
	name: "runtime_validator_count",
	help: "Total number of validators in staking system",
	labelNames: ["type"],
})

const stakeMetric = new PromClient.Gauge({
	name: "runtime_stake",
	help: "Total amount of staked tokens",
	labelNames: ["type"],
})

const ledgerMetric = new PromClient.Gauge({
	name: "runtime_staking_ledger",
	help: "the entire staking ledger data",
	labelNames: ["type"],
})

const councilMetric = new PromClient.Gauge({
	name: "runtime_council",
	help: "Metrics of the council elections pallet.",
	labelNames: ["entity"],
})

const weightMultiplierMetric = new PromClient.Gauge({
	name: "runtime_weight_to_fee_multiplier",
	help: "The weight to fee multiplier, in number."
})

const multiPhaseUnsignedSolutionMetric = new PromClient.Gauge({
	name: "runtime_multi_phase_election_unsigned",
	help: "Stats of the latest unsigned multi_phase submission.",
	labelNames: ["measure"]
})

const multiPhaseSignedSolutionMetric = new PromClient.Gauge({
	name: "runtime_multi_phase_election_signed",
	help: "Stats of the latest signed multi_phase submission.",
	labelNames: ["measure"]
})

const multiPhaseQueuedSolutionScoreMetric = new PromClient.Gauge({
	name: "runtime_multi_phase_election_scorre",
	help: "The score of any queued solution.",
	labelNames: ["score"]
})

const multiPhaseSnapshotMetric = new PromClient.Gauge({
	name: "runtime_multi_phase_election_snapshot",
	help: "Size of the latest multi_phase election snapshot.",
})

const palletSizeMetric = new PromClient.Gauge({
	name: "runtime_pallet_size",
	help: "entire storage size of a pallet, in bytes.",
	labelNames: ["pallet", "item"]
})

// misc
registry.registerMetric(finalizedHeadMetric);
registry.registerMetric(timestampMetric);
registry.registerMetric(weightMultiplierMetric);
registry.registerMetric(councilMetric);
registry.registerMetric(totalIssuanceMetric);

// block
registry.registerMetric(weightMetric);
registry.registerMetric(blockLengthMetric);
registry.registerMetric(numExtrinsicsMetric);

// sttaking
registry.registerMetric(nominatorCountMetric);
registry.registerMetric(validatorCountMetric);
registry.registerMetric(stakeMetric);
registry.registerMetric(ledgerMetric);

// elections
registry.registerMetric(multiPhaseSignedSolutionMetric);
registry.registerMetric(multiPhaseUnsignedSolutionMetric);
registry.registerMetric(multiPhaseSnapshotMetric);
registry.registerMetric(multiPhaseQueuedSolutionScoreMetric);

// meta
registry.registerMetric(palletSizeMetric);

async function stakingHourly(api: ApiPromise) {
	validatorCountMetric.set({ type: "candidate" }, (await api.query.staking.counterForValidators()).toNumber());
	nominatorCountMetric.set({ type: "candidate" }, (await api.query.staking.counterForNominators()).toNumber());
}

async function stakingDaily(api: ApiPromise) {
	logger.debug(`starting sttaking daily process.`);
	let currentEra = (await api.query.staking.currentEra()).unwrapOrDefault();
	let exposures = await api.query.staking.erasStakers.entries(currentEra);

	logger.debug(`fetched ${exposures.length} exposurres`);

	// @ts-ignore
	let totalSelfStake = exposures.map(([_, expo]) => expo.own.toBn().div(decimals(api)).toNumber()).reduce((prev, next) => prev + next);
	// @ts-ignore
	let totalOtherStake = exposures.map(([_, expo]) => (expo.total.toBn().sub(expo.own.toBn())).div(decimals(api)).toNumber()).reduce((prev, next) => prev + next);
	let totalStake = totalOtherStake + totalSelfStake;

	stakeMetric.set({ type: "self" }, totalSelfStake);
	stakeMetric.set({ type: "other" }, totalOtherStake);
	stakeMetric.set({ type: "all" }, totalStake);

	let totalExposedNominators = exposures.map(([_, expo]) => expo.others.length).reduce((prev, next) => prev + next);
	let totalExposedValidators = exposures.length;

	validatorCountMetric.set({ type: "exposed" }, totalExposedValidators);
	nominatorCountMetric.set({ type: "exposed" }, totalExposedNominators);

	let ledgers = await api.query.staking.ledger.entries();

	logger.debug(`fetched ${ledgers.length} ledgers`);

	let totalBondedAccounts = ledgers.length;
	let totalBondedStake = ledgers.map(([_, ledger]) =>
		ledger.unwrapOrDefault().total.toBn().div(decimals(api)).toNumber()
	).reduce((prev, next) => prev + next)
	let totalUnbondingChunks = ledgers.map(([_, ledger]) => {
		if (ledger.unwrapOrDefault().unlocking.length) {
			return ledger.unwrapOrDefault().unlocking.map((unlocking) =>
				unlocking.value.toBn().div(decimals(api)).toNumber()
			).reduce((prev, next) => prev + next)
		} else {
			return 0
		}
	}
	).reduce((prev, next) => prev + next)

	ledgerMetric.set({ type: "bonded_accounts" }, totalBondedAccounts)
	ledgerMetric.set({ type: "bonded_stake" }, totalBondedStake)
	ledgerMetric.set({ type: "unbonding_stake" }, totalUnbondingChunks)
}

async function multiPhasePerBlock(api: ApiPromise, signedBlock: SignedBlock) {
	// check if we had an election-provider solution in this block.
	for (let ext of signedBlock.block.extrinsics) {
		if (ext.method.section.toLowerCase().includes("electionprovider") && ext.method.method === "submitUnsigned") {
			let length = ext.encodedLength;
			let weight = (await api.rpc.payment.queryInfo(ext.toHex())).weight.toNumber();
			logger.debug(`detected submitUnsigned`);
			multiPhaseUnsignedSolutionMetric.set({ 'measure': 'weight' }, weight);
			multiPhaseUnsignedSolutionMetric.set({ 'measure': 'length' }, length);
		}

		if (ext.method.section.toLowerCase().includes("electionprovider") && ext.method.method === "submit") {
			let length = ext.encodedLength;
			let weight = (await api.rpc.payment.queryInfo(ext.toHex())).weight.toNumber()
			logger.debug(`detected submit`);
			multiPhaseUnsignedSolutionMetric.set({ 'measure': 'weight' }, weight);
			multiPhaseUnsignedSolutionMetric.set({ 'measure': 'length' }, length);
		}
	}

	// If this is the block at which signed phase has started:
	let events = await api.query.system.events();
	if (events.filter((ev) => ev.event.method === "SignedPhaseStarted").length > 0) {
		let key = api.query.electionProviderMultiPhase.snapshot.key();
		let size = await api.rpc.state.getStorageSize(key);
		logger.debug(`detected SignedPhaseStarted: ${size.toHuman()}`)
		multiPhaseSnapshotMetric.set(size.toNumber());
	}

	if (events.filter((ev) => ev.event.method === "SolutionStored").length > 0) {
		let qeueued = await api.query.electionProviderMultiPhase.queuedSolution();
		logger.debug(`detected SolutionStored: ${qeueued.unwrapOrDefault().toHuman()}`)
		multiPhaseQueuedSolutionScoreMetric.set({ score: "x1" }, qeueued.unwrapOrDefault().score[0].div(decimals(api)).toNumber())
		multiPhaseQueuedSolutionScoreMetric.set({ score: "x2" }, qeueued.unwrapOrDefault().score[1].div(decimals(api)).toNumber())
	}
}

async function council(api: ApiPromise) {
	if (api.query.electionsPhragmen) {
		let [voters, candidates] = await Promise.all([
			api.query.electionsPhragmen.voting.keys(),
			api.query.electionsPhragmen.candidates(),
		]);
		councilMetric.set({ entity: "voters" }, voters.length);
		// @ts-ignore
		councilMetric.set({ entity: "candidates" }, candidates.length);
	} else if (api.query.phragmenElection) {
		let [voters, candidates] = await Promise.all([
			api.query.phragmenElection.voting.keys(),
			api.query.phragmenElection.candidates(),
		]);
		councilMetric.set({ entity: "voters" }, voters.length);
		// @ts-ignore
		councilMetric.set({ entity: "candidates" }, candidates.length);
	}
}

async function perDay(api: ApiPromise) {
	logger.info(`starting daily scrape at ${new Date().toISOString()}`)
	Promise.all([stakingDaily(api), palletStorageSize(api)])
}

async function perHour(api: ApiPromise) {
	logger.info(`starting hourly scrape at ${new Date().toISOString()}`)
	let stakingPromise = stakingHourly(api);
	let councilPromise = council(api);

	Promise.all([stakingPromise, councilPromise])
}

async function perBlock(api: ApiPromise, header: Header) {
	let number = header.number;
	logger.info(`starting block metric scrape at #${number}`)
	const [weight, timestamp, signed_block] = await Promise.all([
		api.query.system.blockWeight(),
		api.query.timestamp.now(),
		await api.rpc.chain.getBlock(header.hash)
	]);
	const blockLength = signed_block.block.encodedLength;

	finalizedHeadMetric.set(number.toNumber());
	weightMetric.set({ class: "normal" }, weight.normal.toNumber());
	weightMetric.set({ class: "operational" }, weight.operational.toNumber());
	weightMetric.set({ class: "mandatory" }, weight.mandatory.toNumber());
	timestampMetric.set(timestamp.toNumber() / 1000);
	blockLengthMetric.set(blockLength);

	const signedLength = signed_block.block.extrinsics.filter((ext) => ext.isSigned).length
	const unsignedLength = signed_block.block.extrinsics.length - signedLength;
	numExtrinsicsMetric.set({ type: "singed" }, signedLength);
	numExtrinsicsMetric.set({ type: "unsigned" }, unsignedLength);

	// update issuance
	let issuance = (await api.query.balances.totalIssuance()).toBn();
	// @ts-ignore
	let issuancesScaled = issuance.div(decimals(api));
	totalIssuanceMetric.set(issuancesScaled.toNumber())

	let weightFeeMultiplier = await api.query.transactionPayment.nextFeeMultiplier()
	weightMultiplierMetric.set(weightFeeMultiplier.toNumber())

	await multiPhasePerBlock(api, signed_block);
}

async function palletStorageSize(api: ApiPromise) {
	for (let pallet of api.runtimeMetadata.asV14.pallets) {
		const storage = pallet.storage.unwrapOrDefault();
		const prefix = storage.prefix;
		for (let item of storage.items) {
			const x = xxhashAsHex(prefix.toString(), 128);
			const y = xxhashAsHex(item.name.toString(), 128);
			const key = `${x}${y.slice(2)}`;
			const size = await api.rpc.state.getStorageSize(key);
			logger.debug(`size if ${prefix.toString()}/${item.name.toString()}: ${size.toNumber()}`)
			palletSizeMetric.set({ pallet: prefix.toString(), item: item.name.toString() }, size.toNumber());
		}
	}
}

function decimals(api: ApiPromise): BN {
	return new BN(Math.pow(10, api.registry.chainDecimals[0]))
}

async function update() {
	const provider = new WsProvider(WS_PROVIDER);
	const api = await ApiPromise.create({ provider });

	logger.info(`connected to chain ${(await api.rpc.system.chain()).toString().toLowerCase()}`);

	// update stuff per hour
	const _perHour = setInterval(() => perHour(api), HOURS);

	// update stuff daily
	const _perDay = setInterval(() => perDay(api), DAYS);

	// update stuff per block.
	const _perBlock = await api.rpc.chain.subscribeFinalizedHeads((header) => perBlock(api, header));
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

update().then().catch(console.error);
