import { ApiPromise, WsProvider } from "@polkadot/api";
import * as PromClient from "prom-client"
import * as http from "http";
import { config } from "dotenv";
import { hostname } from "node:os";
config();

const WS_PROVIDER = process.env.WS_PROVIDER || "ws://localhost:9944";
const PORT = process.env.PORT || 8080;

const registry = new PromClient.Registry();
registry.setDefaultLabels({
	app: 'runtime-metrics'
})

const finalizedHeadMetric = new PromClient.Gauge({
	name: "chain_finalized_number",
	help: "finalized head of the chain."
})

const WeightMetric = new PromClient.Gauge({
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

registry.registerMetric(finalizedHeadMetric);
registry.registerMetric(WeightMetric);
registry.registerMetric(timestampMetric);
registry.registerMetric(blockLengthMetric);
registry.registerMetric(numExtrinsicsMetric);

async function update() {
	const provider = new WsProvider(WS_PROVIDER);
	const api = await ApiPromise.create( { provider });

	// only look into finalized blocks.
	const _unsubscribe = await api.rpc.chain.subscribeFinalizedHeads(async (header) => {
		let number = header.number;
		const [weight, timestamp, signed_block] = await Promise.all([
			api.query.system.blockWeight(),
			api.query.timestamp.now(),
			await api.rpc.chain.getBlock(header.hash)
		]);
		const blockLength = signed_block.block.encodedLength;

		finalizedHeadMetric.set(number.toNumber());
		WeightMetric.set({ class: "normal" }, weight.normal.toNumber());
		WeightMetric.set({ class: "operational" }, weight.operational.toNumber());
		WeightMetric.set({ class: "mandatory" }, weight.mandatory.toNumber());
		timestampMetric.set(timestamp.toNumber() / 1000);
		blockLengthMetric.set(blockLength);

		const signedLength = signed_block.block.extrinsics.filter((ext) => ext.isSigned).length
		const unsignedLength = signed_block.block.extrinsics.length - signedLength;
		numExtrinsicsMetric.set({ type: "singed" }, signedLength);
		numExtrinsicsMetric.set({ type: "unsigned" }, unsignedLength);

		console.log(`updated state according to #${number}`)
	});
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

update().catch(console.error);
