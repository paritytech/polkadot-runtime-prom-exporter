import { ApiPromise } from "@polkadot/api";
import { config } from "dotenv";
import { decimals, sequelizeParams, offset } from '../utils'
import * as PromClient from "prom-client"
import { CTimeScaleExporter } from './CTimeScaleExporter';
import { BALANCE_WORKER_PATH } from './workersPaths'
import { launchLoading } from './LoadHistory'

config();
const connectionString = process.env.TSDB_CONN || "";
const Sequelize = require('sequelize');
const sequelize = (connectionString != "") ? new Sequelize(connectionString, { sequelizeParams, logging: false }) : null;

export class Balances extends CTimeScaleExporter {
    balancesSql: typeof Sequelize;
    totalIssuanceMetric: any;
    withProm: boolean;
    withTs: boolean;
    registry: PromClient.Registry;
    exportersVersionsSql: typeof Sequelize;

    constructor(workerPath: string, registry: PromClient.Registry, withProm: boolean) {

        super(workerPath);
        this.registry = registry;
        this.withProm = withProm;
        this.withTs = (connectionString == "" ? false : true);

        if (this.withTs) {
            this.balancesSql = sequelize.define("runtime_total_issuance", {
                time: { type: Sequelize.DATE, primaryKey: true },
                chain: { type: Sequelize.STRING, primaryKey: true },
                issuance: { type: Sequelize.BIGINT },
            }, { timestamps: false, freezeTableName: true });
        }
        if (this.withProm) {
            this.totalIssuanceMetric = new PromClient.Gauge({
                name: "runtime_total_issuance",
                help: "the total issuance of the runtime, updated per block",
                labelNames: ["type", "chain"]
            })
            registry.registerMetric(this.totalIssuanceMetric);
        }
    }

    async write(time: number, myChain: string, issuance: number, withProm: boolean) {

        if (this.withTs) {
            const result = await this.balancesSql.create(
                {
                    time: time,
                    chain: myChain,
                    issuance: issuance
                }, { fields: ['time', 'chain', 'issuance'] },
                { tableName: 'runtime_total_issuance' });
        }

        if (this.withProm) {
            this.totalIssuanceMetric.set({ chain: myChain }, issuance);
        }
    }

    async doWork(exporter: Balances, api: ApiPromise, indexBlock: number, chainName: string) {

        const blockHash = await api.rpc.chain.getBlockHash(indexBlock);
        const apiAt = await api.at(blockHash);
        const timestamp = (await api.query.timestamp.now.at(blockHash)).toNumber();

        const issuance = (await apiAt.query.balances.totalIssuance()).toBn();
        const issuancesScaled = issuance.div(decimals(api)).toNumber();

        await exporter.write(timestamp, chainName.toString(), issuancesScaled, exporter.withProm);

    }

    async clean(myChainName: string, startingBlockTime: Date, endingBlockTime: Date) {
        await super.cleanData(this.balancesSql, myChainName, startingBlockTime, endingBlockTime)
    }
}

async function run() {
    await launchLoading(exporter);
}

const registry = new PromClient.Registry();
let exporter = new Balances(BALANCE_WORKER_PATH, registry, false);
run();
