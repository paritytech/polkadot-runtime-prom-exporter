import { ApiPromise } from "@polkadot/api";
import { config } from "dotenv";
import { decimals, sequelizeParams, offset } from '../utils'
import * as PromClient from "prom-client"
import { CTimeScaleExporter } from './CTimeScaleExporter';
import { TIMESTAMP_WORKER_PATH } from './workersPaths'
import { launchLoading } from './LoadHistory'

config();
const connectionString = process.env.TSDB_CONN || "";
const Sequelize = require('sequelize');
const sequelize = (connectionString != "") ? new Sequelize(connectionString, { sequelizeParams, logging: false }) : null;

export class Timestamp extends CTimeScaleExporter {
    timestampSql: typeof Sequelize;
    timestampMetric: any

    withProm: boolean;
    registry: PromClient.Registry;

    constructor(workerPath: string, registry: PromClient.Registry, withProm: boolean) {

        super(workerPath);
        this.registry = registry;
        this.withProm = withProm;

        this.timestampSql = sequelize.define("runtime_timestamp_seconds", {
            time: { type: Sequelize.DATE, primaryKey: true },
            chain: { type: Sequelize.STRING, primaryKey: true },
            timestamp: { type: Sequelize.INTEGER },
        }, { timestamps: false, freezeTableName: true });

        if (this.withProm) {

            this.timestampMetric = new PromClient.Gauge({
                name: "runtime_timestamp_seconds",
                help: "timestamp of the block.",
                labelNames: ["chain"]

            })

            registry.registerMetric(this.timestampMetric);

        }
    }

    async write(time: number, myChain: string, timestamp: number, withProm: boolean) {

        const result = await this.timestampSql.create(
            {
                time: time,
                chain: myChain,
                timestamp: timestamp
            }, { fields: ['time', 'chain', 'timestamp'] },
            { tableName: 'runtime_timestamp_seconds' });

        if (this.withProm) {
            this.timestampMetric.set({ chain: myChain }, timestamp);
        }
    }

    async doWork(exporter: Timestamp, api: ApiPromise, indexBlock: number, chainName: string) {

        const blockHash = await api.rpc.chain.getBlockHash(indexBlock);
        const apiAt = await api.at(blockHash);
        let timestamp = (await api.query.timestamp.now.at(blockHash)).toNumber();

        exporter.write(timestamp, chainName.toString(), Math.round(timestamp / 1000), exporter.withProm);

    }
}

async function run() {
    await launchLoading(exporter);
}

const registry = new PromClient.Registry();
let exporter = new Timestamp(TIMESTAMP_WORKER_PATH, registry, false);
run();
