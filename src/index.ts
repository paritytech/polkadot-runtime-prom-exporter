import { ApiPromise, WsProvider } from "@polkadot/api";
import * as PromClient from "prom-client"
import * as http from "http";
import { config } from "dotenv";
config();

// TODO: this should be .env
const WS_PROVIDER = process.env.WS_PROVIDER || "ws://localhost:9944";
const PORT = process.env.PORT || 8080;

const registry = new PromClient.Registry();
registry.setDefaultLabels({
	app: 'polkadot-runtime-metrics'
})

const normalWeightMetric = new PromClient.Gauge({
	name: "normal_weight_per_block",
	help: "...",
})

const operationalWeightMetric = new PromClient.Gauge({
	name: "operational_weight_per_block",
	help: "...",
})

const mandatoryWeightMetric = new PromClient.Gauge({
	name: "mandatory_weight_per_block",
	help: "...",
})

const timestampMetric = new PromClient.Gauge({
	name: "block_timestamp",
	help: "...",
})

const blockLengthMetric = new PromClient.Gauge({
	name: "block_length",
	help: "...",
})

const numExtrinsicsMetric = new PromClient.Gauge({
	name: "num_extrinsics",
	help: "...",
})

registry.registerMetric(normalWeightMetric);
registry.registerMetric(operationalWeightMetric);
registry.registerMetric(mandatoryWeightMetric);
registry.registerMetric(timestampMetric);
registry.registerMetric(blockLengthMetric);
registry.registerMetric(numExtrinsicsMetric);

async function update() {
	const provider = new WsProvider(WS_PROVIDER);
	const api = await ApiPromise.create( { provider });

	// only look into finalized blocks.
	const _unsubscribe = await api.rpc.chain.subscribeFinalizedHeads(async (header) => {
		// todo: use promise.all()
		const weight = await api.query.system.blockWeight();
		const timestamp = await api.query.timestamp.now();
		const block = (await api.rpc.chain.getBlock(header.hash)).block;
		const numExtrinsics = block.extrinsics.length;
		const blockLength = block.encodedLength;

		normalWeightMetric.set(weight.normal.toNumber());
		operationalWeightMetric.set(weight.operational.toNumber());
		mandatoryWeightMetric.set(weight.mandatory.toNumber());
		timestampMetric.set(timestamp.toNumber());
		blockLengthMetric.set(blockLength);
		numExtrinsicsMetric.set(numExtrinsics);

		console.log(`updated state according to #${header.number}`)
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
// Start the HTTP server which exposes the metrics on http://localhost:8080/metrics
server.listen(PORT)
console.log(`Server listening on port ${PORT}`)

update().catch(console.error);
