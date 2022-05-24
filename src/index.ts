import { ApiPromise, WsProvider } from "@polkadot/api";
import { Header, SignedBlock } from "@polkadot/types/interfaces";
import "@polkadot/api-augment";
import * as PromClient from "prom-client"
import * as http from "http";
import { config } from "dotenv";
import BN from "bn.js";
import { xxhashAsHex } from "@polkadot/util-crypto";
import * as winston from 'winston'
import { AccountId, Balance, } from "@polkadot/types/interfaces/runtime"
import { PalletBagsListListNode } from "@polkadot/types/lookup"
import { ApiDecoration } from "@polkadot/api/types";

config();

/// Something that wants to be an exporter of data.
interface Exporter {
	/// The name of this pallet. If this property exists in `apu.query`, then we can assume this
	/// pallet exists in a runtime we connect to.
	///
	/// TODO: This is fundamentally flawed, since a pallet can be renamed inside the runtime. We need a
	/// better unique identifier for each pallet on the FRAME side.
	palletIdentifier: any;


	/// Hook executed per every block.
	///
	/// The header and block are also provided.
	perBlock(api: ApiPromise, header: Header): Promise<void>,
	/// Hook executed per every hour.
	perHour(api: ApiPromise): any,
	/// Hook executed per every
	perDay(api: ApiPromise): any,
}

class SystemExporter implements Exporter {
	palletIdentifier: any;
	finalizedHead: PromClient.Gauge<"class">;
	blockWeight: PromClient.Gauge<"class">;
	blockLength: PromClient.Gauge<"class">;
	numExtrinsics: PromClient.Gauge<"type">;
	palletSize: PromClient.Gauge<"pallet" | "item">

	constructor(registry: PromClient.Registry) {
		this.palletIdentifier = "system";

		this.finalizedHead = new PromClient.Gauge({
			name: "chain_finalized_number",
			help: "finalized head of the chain."
		})
		this.blockWeight = new PromClient.Gauge({
			name: "runtime_weight",
			help: "weight of the block; labeled by dispatch class.",
			labelNames: ["class"]
		})
		this.blockLength = new PromClient.Gauge({
			name: "runtime_block_length_bytes",
			help: "encoded length of the block in bytes.",
		})
		this.numExtrinsics = new PromClient.Gauge({
			name: "runtime_extrinsics_count",
			help: "number of extrinsics in the block, labeled by signature type.",
			labelNames: ["type"]
		})
		this.palletSize = new PromClient.Gauge({
			name: "runtime_pallet_size",
			help: "entire storage size of a pallet, in bytes.",
			labelNames: ["pallet", "item"]
		})

		registry.registerMetric(this.finalizedHead);
		registry.registerMetric(this.blockWeight);
		registry.registerMetric(this.blockLength);
		registry.registerMetric(this.numExtrinsics);
		registry.registerMetric(this.palletSize);
	}

	async perBlock(api: ApiPromise, header: Header): Promise<void> {
		this.finalizedHead.set(header.number.toNumber());

		const weight = await api.query.system.blockWeight();
		this.blockWeight.set({ class: "normal" }, weight.normal.toNumber());
		this.blockWeight.set({ class: "operational" }, weight.operational.toNumber());
		this.blockWeight.set({ class: "mandatory" }, weight.mandatory.toNumber());

		const block = await api.rpc.chain.getBlock(header.hash);
		this.blockLength.set(block.block.encodedLength);

		const signedLength = block.block.extrinsics.filter((ext) => ext.isSigned).length
		const unsignedLength = block.block.extrinsics.length - signedLength;

		this.numExtrinsics.set({ type: "signed" }, signedLength);
		this.numExtrinsics.set({ type: "unsigned" }, unsignedLength);
	}

	async perDay(api: ApiPromise) {
		for (let pallet of api.runtimeMetadata.asV14.pallets) {
			const storage = pallet.storage.unwrapOrDefault();
			const prefix = storage.prefix;
			for (let item of storage.items) {
				const x = xxhashAsHex(prefix.toString(), 128);
				const y = xxhashAsHex(item.name.toString(), 128);
				const key = `${x}${y.slice(2)}`;
				const size = await api.rpc.state.getStorageSize(key);
				logger.info(`size if ${prefix.toString()}/${item.name.toString()}: ${size.toNumber()}`)
				this.palletSize.set({ pallet: prefix.toString(), item: item.name.toString() }, size.toNumber());
			}
		}
	}

	perHour(api: ApiPromise) { }
}

// 15 mins, instead of the default 1min.
const DEFAULT_TIMEOUT = 15 * 60 * 1000;

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

async function getFinalizedApi(api: ApiPromise): Promise<ApiDecoration<"promise">> {
	const finalized = await api.rpc.chain.getFinalizedHead();
	return await api.at(finalized)
}


const WS_PROVIDER = process.env.WS_PROVIDER || "ws://localhost:9999";
const PORT = process.env.PORT || 8080;

console.log(`+ WS_PROVIDER = ${WS_PROVIDER}`)
console.log(`+ PORT = ${PORT}`)

const SECONDS = 1000;
const MINUTES = 60 * SECONDS;
const HOURS = 60 * MINUTES;

// TODO: histogram of calls
// TODO: total number of accounts
// TODO: counter of bag nodes matching
// TODO: pools: TVL, num pools, num-members, points to balance-ratio of each pool

// TODO: this should not be a global object once this refactor is done.
const registry = new PromClient.Registry();
registry.setDefaultLabels({
	app: 'runtime-metrics'
})



// timestamp
const timestampMetric = new PromClient.Gauge({
	name: "runtime_timestamp_seconds",
	help: "timestamp of the block.",
})

// balances
const totalIssuanceMetric = new PromClient.Gauge({
	name: "runtime_total_issuance",
	help: "the total issuance of the runtime, updated per block",
})

// staking
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

// transaction payment
const weightMultiplierMetric = new PromClient.Gauge({
	name: "runtime_weight_to_fee_multiplier",
	help: "The weight to fee multiplier, in number."
})

// election-provider-multi-phase
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
	name: "runtime_multi_phase_election_score",
	help: "The score of any queued solution.",
	labelNames: ["score"]
})

const multiPhaseSnapshotMetric = new PromClient.Gauge({
	name: "runtime_multi_phase_election_snapshot",
	help: "Size of the latest multi_phase election snapshot.",
})

// bags-list pallet.
const voterListBags = new PromClient.Gauge({
	name: "runtime_voter_list_bags",
	help: "number of voter list bags",
	labelNames: ["type"] // active or empty
})

const voterListNodesPerBag = new PromClient.Gauge({
	name: "runtime_voter_list_node_per_bag",
	help: "number of nodes per bag",
	labelNames: ["bag"],

})

const voterListNodes = new PromClient.Gauge({
	name: "runtime_voter_list_nodes",
	help: "number of nodes in the voter list",
	labelNames: ["type"] // node or needs-rebag
})

// misc
registry.registerMetric(timestampMetric);
registry.registerMetric(weightMultiplierMetric);
registry.registerMetric(totalIssuanceMetric);

// staking
registry.registerMetric(nominatorCountMetric);
registry.registerMetric(validatorCountMetric);
registry.registerMetric(stakeMetric);
registry.registerMetric(ledgerMetric);

// elections
registry.registerMetric(multiPhaseSignedSolutionMetric);
registry.registerMetric(multiPhaseUnsignedSolutionMetric);
registry.registerMetric(multiPhaseSnapshotMetric);
registry.registerMetric(multiPhaseQueuedSolutionScoreMetric);

// bags
registry.registerMetric(voterListBags);
registry.registerMetric(voterListNodes);
registry.registerMetric(voterListNodesPerBag);

async function stakingHourly(baseApi: ApiPromise) {
	const api = await getFinalizedApi(baseApi);
	let currentEra = (await api.query.staking.currentEra()).unwrapOrDefault();
	let exposures = await api.query.staking.erasStakers.entries(currentEra);

	let totalSelfStake = exposures.map(([_, expo]) => expo.own.toBn().div(decimals(api)).toNumber()).reduce((prev, next) => prev + next);
	let totalOtherStake = exposures.map(([_, expo]) => (expo.total.toBn().sub(expo.own.toBn())).div(decimals(api)).toNumber()).reduce((prev, next) => prev + next);
	let totalStake = totalOtherStake + totalSelfStake;

	stakeMetric.set({ type: "self" }, totalSelfStake);
	stakeMetric.set({ type: "other" }, totalOtherStake);
	stakeMetric.set({ type: "all" }, totalStake);

	let totalExposedNominators = exposures.map(([_, expo]) => expo.others.length).reduce((prev, next) => prev + next);
	let totalExposedValidators = exposures.length;

	validatorCountMetric.set({ type: "active" }, totalExposedValidators);
	nominatorCountMetric.set({ type: "active" }, totalExposedNominators);
}

async function stakingDaily(baseApi: ApiPromise) {
	const api = await getFinalizedApi(baseApi);
	logger.debug(`starting staking daily process.`);
	let ledgers = await api.query.staking.ledger.entries();

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
			multiPhaseSignedSolutionMetric.set({ 'measure': 'weight' }, weight);
			multiPhaseSignedSolutionMetric.set({ 'measure': 'length' }, length);
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
	if (events.filter((ev) => ev.event.method.toString() == "SignedPhaseStarted").length > 0) {
		let key = api.query.electionProviderMultiPhase.snapshot.key();
		let size = await api.rpc.state.getStorageSize(key);
		logger.debug(`detected SignedPhaseStarted, snap size: ${size.toHuman()}`)
		multiPhaseSnapshotMetric.set(size.toNumber());
	}

	if (events.filter((ev) => ev.event.method.toString() == "SolutionStored").length > 0) {
		let queued = await api.query.electionProviderMultiPhase.queuedSolution();
		logger.debug(`detected SolutionStored: ${queued.unwrapOrDefault().toString()}`)
		multiPhaseQueuedSolutionScoreMetric.set({ score: "x1" }, queued.unwrapOrDefault().score.minimalStake.div(decimals(api)).toNumber())
		multiPhaseQueuedSolutionScoreMetric.set({ score: "x2" }, queued.unwrapOrDefault().score.sumStake.div(decimals(api)).toNumber())
	}
}

async function perDay(api: ApiPromise) {
	logger.info(`starting daily scrape at ${new Date().toISOString()}`)
	Promise.all([stakingDaily(api)])
}

async function voterBags(baseApi: ApiPromise) {
	const api = await getFinalizedApi(baseApi);

	interface Bag {
		head: AccountId,
		tail: AccountId,
		upper: Balance,
		nodes: AccountId[],
	}

	async function needsRebag(
		api: ApiDecoration<"promise">,
		bagThresholds: BN[],
		node: PalletBagsListListNode,
	): Promise<boolean> {
		const currentWeight = await correctWeightOf(node, api);
		const canonicalUpper = bagThresholds.find((t) => t.gt(currentWeight)) || new BN("18446744073709551615");
		if (canonicalUpper.gt(node.bagUpper)) {
			return true
		} else if (canonicalUpper.lt(node.bagUpper)) {
			// this should ALMOST never happen: we handle all rebags to lower accounts, except if a
			// slash happens.
			return true
		} else {
			// correct spot.
			return false
		}
	}

	async function correctWeightOf(node: PalletBagsListListNode, api: ApiDecoration<"promise">): Promise<BN> {
		const currentAccount = node.id;
		const currentCtrl = (await api.query.staking.bonded(currentAccount)).unwrap();
		return (await api.query.staking.ledger(currentCtrl)).unwrapOrDefault().active.toBn()
	}


	let entries = await api.query.bagsList.listBags.entries();

	const bags: Bag[] = [];
	const needRebag: AccountId[] = [];
	const bagThresholds = api.consts.bagsList.bagThresholds.map((x) => baseApi.createType('Balance', x));

	entries.forEach(([key, bag]) => {
		if (bag.isSome && bag.unwrap().head.isSome && bag.unwrap().tail.isSome) {
			const head = bag.unwrap().head.unwrap();
			const tail = bag.unwrap().tail.unwrap();
			const keyInner = key.args[0];
			const upper = baseApi.createType('Balance', keyInner.toBn());
			bags.push({ head, tail, upper, nodes: [] })
		}
	});

	console.log(`🧾 collected a total of ${bags.length} active bags.`)
	bags.sort((a, b) => a.upper.cmp(b.upper));

	let counter = 0;
	for (const { head, tail, upper, nodes } of bags) {
		// process the bag.
		let current = head;
		let cond = true
		while (cond) {
			const currentNode = (await api.query.bagsList.listNodes(current)).unwrap();
			if (await needsRebag(api, bagThresholds, currentNode)) {
				needRebag.push(currentNode.id);
			}
			nodes.push(currentNode.id);
			if (currentNode.next.isSome) {
				current = currentNode.next.unwrap()
			} else {
				cond = false
			}
		}
		counter += nodes.length;
		voterListNodesPerBag.set({ "bag": upper.toString() }, nodes.length)
		console.log(`👜 Bag ${upper.toHuman()} - ${nodes.length} nodes: [${head} .. -> ${head !== tail ? tail : ''}]`)
	}

	voterListBags.set({ type: "active" }, bags.length)
	voterListBags.set({ type: "empty" }, bagThresholds.length);

	voterListNodes.set({ type: "all_nodes" }, counter);
	voterListNodes.set({ type: "needs_rebag" }, needsRebag.length);

	console.log(`📊 total count of nodes: ${counter}`);
	console.log(`..of which ${needRebag.length} need a rebag`);
}

async function perHour(api: ApiPromise) {
	logger.info(`starting hourly scrape at ${new Date().toISOString()}`)
	let stakingPromise = stakingHourly(api);
	let voterBagsPromise = voterBags(api);
	Promise.all([stakingPromise, voterBagsPromise])
}

async function perBlock(api: ApiPromise, header: Header) {
	let number = header.number;
	logger.info(`starting block metric scrape at #${number}`)
	const [weight, timestamp, signed_block] = await Promise.all([
		api.query.system.blockWeight(),
		api.query.timestamp.now(),
		api.rpc.chain.getBlock(header.hash)
	]);

	timestampMetric.set(timestamp.toNumber() / 1000);

	// update issuance
	let issuance = (await api.query.balances.totalIssuance()).toBn();
	// @ts-ignore
	let issuancesScaled = issuance.div(decimals(api));
	totalIssuanceMetric.set(issuancesScaled.toNumber())

	let weightFeeMultiplier = await api.query.transactionPayment.nextFeeMultiplier()
	weightMultiplierMetric.set(weightFeeMultiplier.mul(new BN(100)).div(new BN(10).pow(new BN(18))).toNumber())

	validatorCountMetric.set({ type: "intention" }, (await api.query.staking.counterForValidators()).toNumber());
	nominatorCountMetric.set({ type: "intention" }, (await api.query.staking.counterForNominators()).toNumber());

	await multiPhasePerBlock(api, signed_block);
}

function decimals(api: ApiDecoration<"promise">): BN {
	return new BN(Math.pow(10, api.registry.chainDecimals[0]))
}

async function main() {
	// TODO: should come from json config.
	const chains = ["ws://localhost:9999"];
	// hardcoded for now, just the list of all the exporters that we support.
	const exporters = [new SystemExporter(registry)]

	for (let chain of chains) {
		const provider = new WsProvider(chain, 1000, {}, DEFAULT_TIMEOUT);
		const api = await ApiPromise.create({ provider });
		const chainName = await api.rpc.system.name();
		logger.info(`connected to chain ${chainName}`);

		// TODO: all of the async operations could potentially be double-checked for sensibility,
		// and improved. Also, more things can be parallelized here with Promise.all.
		for (let exporter of exporters) {
			if (api.query[exporter.palletIdentifier]) {
				logger.info(`registering ${exporter.palletIdentifier} exporter for chain ${chainName}`);
				const _perHour = setInterval(() => exporter.perHour(api), 60 * MINUTES);
				const _perDay = setInterval(() => exporter.perDay(api), 24 * HOURS);
				const _perBlock = await api.rpc.chain.subscribeFinalizedHeads((header) => exporter.perBlock(api, header));
			}
		}
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
