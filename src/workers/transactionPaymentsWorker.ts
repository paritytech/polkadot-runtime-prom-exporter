import { ApiPromise } from "@polkadot/api";
import { config } from "dotenv";
import { sequelizeParams } from '../utils'
import * as PromClient from "prom-client"
import { CTimeScaleExporter } from './CTimeScaleExporter';
import { launchLoading } from './LoadHistory'
import { TRANSACTION_PAYMENTS_WORKER_PATH } from './workersPaths'
import BN from "bn.js";

config();
const connectionString = process.env.TSDB_CONN || "";
const Sequelize = require('sequelize');
const sequelize = (connectionString != "") ? new Sequelize(connectionString, { sequelizeParams, logging: false }) : null;

export class TransactionPayments extends CTimeScaleExporter {
    weightToFeeMultiplierSql: typeof Sequelize;
    weightMultiplierMetric: any;
    withProm: boolean;
    withTs: boolean;
    registry: PromClient.Registry;

    constructor(workerPath: string, registry: PromClient.Registry, withProm: boolean) {

        super(workerPath);
        this.registry = registry;
        this.withProm = withProm;
        this.withTs = (connectionString == "" ? false : true);

        if (this.withTs) {

            this.weightToFeeMultiplierSql = sequelize.define("runtime_weight_to_fee_multiplier", {
                time: { type: Sequelize.DATE, primaryKey: true },
                chain: { type: Sequelize.STRING, primaryKey: true },
                weightmultiplier: { type: Sequelize.INTEGER },
            }, { timestamps: false, freezeTableName: true });
        }
        if (this.withProm) {

            this.weightMultiplierMetric = new PromClient.Gauge({
                name: "runtime_weight_to_fee_multiplier",
                help: "The weight to fee multiplier, in number.",
                labelNames: ["type", "chain"]

            })

            registry.registerMetric(this.weightMultiplierMetric);

        }
    }

    async write(time: number, myChain: string, weightMultiplier: number, withProm: boolean) {

        if (this.withTs) {
            const result = await this.weightToFeeMultiplierSql.create(
                {
                    time: time,
                    chain: myChain,
                    weightmultiplier: weightMultiplier
                }, { fields: ['time', 'chain', 'weightmultiplier'] },
                { tableName: 'runtime_weight_to_fee_multiplier' });
        }

        if (this.withProm) {
            this.weightMultiplierMetric.set({ chain: myChain }, weightMultiplier);
        }
    }

    async clean(myChainName: string, startingBlockTime: Date, endingBlockTime: Date) {

        await super.cleanData(this.weightToFeeMultiplierSql, myChainName, startingBlockTime, endingBlockTime)

    }

    async doWork(exporter: TransactionPayments, api: ApiPromise, indexBlock: number, chainName: string) {

        const blockHash = await api.rpc.chain.getBlockHash(indexBlock);
        const apiAt = await api.at(blockHash);
        let timestamp = (await api.query.timestamp.now.at(blockHash)).toNumber();

        let weightFeeMultiplier = await apiAt.query.transactionPayment.nextFeeMultiplier()

        const weightFreeMultFormated = weightFeeMultiplier.mul(new BN(100)).div(new BN(10).pow(new BN(18))).toNumber();
        await exporter.write(timestamp, chainName.toString(), weightFreeMultFormated, exporter.withProm);

    }
}

async function run() {
    await launchLoading(exporter);
}

const registry = new PromClient.Registry();
let exporter = new TransactionPayments(TRANSACTION_PAYMENTS_WORKER_PATH, registry, false);
run();
