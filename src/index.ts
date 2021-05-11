import { ApiPromise, WsProvider } from "@polkadot/api";
import { Header } from "@polkadot/types/interfaces";
import * as PromClient from "prom-client"
import * as http from "http";
import { config } from "dotenv";
import BN from "bn.js";
config();

const WS_PROVIDER = process.env.WS_PROVIDER || "ws://localhost:9944";
const PORT = process.env.PORT || 8080;

console.log(`+ WS_PROVIDER = ${WS_PROVIDER}`)
console.log(`+ PORT = ${PORT}`)

const SECONDS = 1000;
const MINUTES = 60 * SECONDS;
const HOURS = 60 * MINUTES;
const DAYS = 24 * HOURS;

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
	labelNames: [ "class" ]
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

const multiPhaseSolution = new PromClient.Gauge({
	name: "runtime_multi_phase_election_unsigned",
	help: "Stats of the latest multi_phase submission, only unsigned.",
	labelNames: ["measure"]
})

registry.registerMetric(finalizedHeadMetric);
registry.registerMetric(weightMetric);
registry.registerMetric(timestampMetric);
registry.registerMetric(blockLengthMetric);
registry.registerMetric(numExtrinsicsMetric);
registry.registerMetric(totalIssuanceMetric);
registry.registerMetric(nominatorCountMetric);
registry.registerMetric(validatorCountMetric);
registry.registerMetric(stakeMetric);
registry.registerMetric(ledgerMetric);
registry.registerMetric(councilMetric);
registry.registerMetric(multiPhaseSolution);

async function stakingHourly(api: ApiPromise) {
	let currentEra = (await api.query.staking.currentEra()).unwrapOrDefault();
	let [validators, nominators, exposures] = await Promise.all([
		api.query.staking.validators.entries(),
		api.query.staking.nominators.entries(),
		api.query.staking.erasStakers.entries(currentEra),
	]);

	validatorCountMetric.set({ type: "candidate" }, validators.length);
	nominatorCountMetric.set({ type: "candidate" }, nominators.length);

	// @ts-ignore
	let totalExposedNominators = exposures.map(([_, expo]) => expo.others.length).reduce((prev, next) => prev + next);
	let totalExposedValidators = exposures.length;

	// @ts-ignore
	let totalSelfStake = exposures.map(([_, expo]) => expo.own.toBn().div(api.decimalPoints).toNumber()).reduce((prev, next) => prev + next);
	// @ts-ignore
	let totalOtherStake = exposures.map(([_, expo]) => (expo.total.toBn().sub(expo.own.toBn())).div(api.decimalPoints).toNumber()).reduce((prev, next) => prev + next);
	let totalStake = totalOtherStake + totalSelfStake;

	stakeMetric.set({ type: "self" }, totalSelfStake);
	stakeMetric.set({ type: "other" }, totalOtherStake);
	stakeMetric.set({ type: "all" }, totalStake);

	validatorCountMetric.set({ type: "exposed" }, totalExposedValidators);
	nominatorCountMetric.set({ type: "exposed" }, totalExposedNominators);
}

async function stakingDaily(api: ApiPromise) {
	let ledgers = await api.query.staking.ledger.entries();
	// @ts-ignore
	let decimalPoints = api.decimalPoints;

	let totalBondedAccounts = ledgers.length;
	let totalBondedStake = ledgers.map(([_, ledger]) =>
		ledger.unwrapOrDefault().total.toBn().div(decimalPoints).toNumber()
	).reduce((prev, next) => prev + next)
	let totalUnbondingChunks = ledgers.map(([_, ledger]) =>
		ledger.unwrapOrDefault().unlocking.map((unlocking) =>
			unlocking.value.toBn().div(decimalPoints).toNumber()
		).reduce((prev, next) => prev + next)
	).reduce((prev, next) => prev + next)

	ledgerMetric.set({ type: "bonded_accounts" }, totalBondedAccounts)
	ledgerMetric.set({ type: "bonded_stake" }, totalBondedStake)
	ledgerMetric.set({ type: "unbonding_stake" }, totalUnbondingChunks)
}

async function council(api: ApiPromise) {
	if (api.query.electionsPhragmen) {
		let [voters, candidates] = await Promise.all([
			api.query.electionsPhragmen.voting.entries(),
			api.query.electionsPhragmen.candidates(),
		]);
		councilMetric.set( { entity: "voters" }, voters.length);
		// @ts-ignore
		councilMetric.set( { entity: "candidates" }, candidates.length);
	} else if (api.query.phragmenElection) {
		let [voters, candidates] = await Promise.all([
			api.query.phragmenElection.voting.entries(),
			api.query.phragmenElection.candidates(),
		]);
		councilMetric.set({ entity: "voters" }, voters.length);
		// @ts-ignore
		councilMetric.set({ entity: "candidates" }, candidates.length);
	}
}

async function perDay(api: ApiPromise) {
	let stakingPromise = stakingDaily(api);
	Promise.all([stakingPromise])
	console.log(`updated daily metrics at ${new Date()}`)
}

async function perHour(api: ApiPromise) {
	let stakingPromise = stakingHourly(api);
	let councilPromise = council(api);

	Promise.all([stakingPromise, councilPromise])
	console.log(`updated hourly metrics at ${new Date()}`)
}

async function perBlock(api: ApiPromise, header: Header) {
	let number = header.number;
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
	let issuancesScaled = issuance.div(api.decimalPoints);
	totalIssuanceMetric.set(issuancesScaled.toNumber())

	// check if we had an election-provider solution in this block.
	for (let ext of signed_block.block.extrinsics) {
		if (ext.meta.name.toHuman().startsWith('submit_unsigned')) {
			let length = ext.encodedLength;
			let weight = (await api.rpc.payment.queryInfo(ext.toHex())).weight.toNumber()
			multiPhaseSolution.set({ 'measure': 'weight' }, weight);
			multiPhaseSolution.set({ 'measure': 'length' }, length);
		}
	}

	console.log(`updated metrics according to #${number}`)
}

async function update() {
	const provider = new WsProvider(WS_PROVIDER);
	const api = await ApiPromise.create( { provider });

	// TODO: api.registry.chainDecimals
	const decimalPoints =
		(await api.rpc.system.chain()).toString().toLowerCase() == "polkadot" ?
			new BN(Math.pow(10, 10)) :
			new BN(Math.pow(10, 12));

	// @ts-ignore
	api.decimalPoints = decimalPoints;

	// update stuff per hour
	const _perHour = setInterval(() => perHour(api), HOURS * 1);

	// update stuff daily
	// const _perDay = setInterval(() => perDay(api), 3 * MINUTES / 2);

	// update stuff per block.
	const _perBlock = api.rpc.chain.subscribeFinalizedHeads((header) => perBlock(api, header));
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
update().catch(console.error).finally(() => process.exit());
