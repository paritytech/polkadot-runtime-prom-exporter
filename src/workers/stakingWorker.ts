import { ApiPromise } from "@polkadot/api";
import { config } from "dotenv";
import { decimals, sequelizeParams, offset } from '../utils'
import * as PromClient from "prom-client"
import { CTimeScaleExporter } from './CTimeScaleExporter';
import { STAKING_WORKER_PATH } from './workersPaths'
import { launchLoading } from './LoadHistory'
import { logger } from '../logger';
import { Console } from "console";

config();
const connectionString = process.env.TSDB_CONN || "";
const Sequelize = require('sequelize');
const sequelize = (connectionString != "") ? new Sequelize(connectionString, { sequelizeParams, logging: false }) : null;

export class Staking extends CTimeScaleExporter {
    nominatorCountSql: typeof Sequelize;
    validatorCountSql: typeof Sequelize;

    nominatorCountMetric: any;
    validatorCountMetric: any;

    withProm: boolean;
    registry: PromClient.Registry;

    constructor(workerPath: string, registry: PromClient.Registry, withProm: boolean) {

        super(workerPath);
        this.registry = registry;
        this.withProm = withProm;

        this.nominatorCountSql = sequelize.define("runtime_nominator_count", {
            time: { type: Sequelize.DATE, primaryKey: true },
            chain: { type: Sequelize.STRING, primaryKey: true },
            nominatorcount: { type: Sequelize.INTEGER },
        }, { timestamps: false, freezeTableName: true });

        this.validatorCountSql = sequelize.define("runtime_validator_count", {
            time: { type: Sequelize.DATE, primaryKey: true },
            chain: { type: Sequelize.STRING, primaryKey: true },
            validatorcount: { type: Sequelize.INTEGER },
        }, { timestamps: false, freezeTableName: true });

        if (this.withProm) {

            // staking
            this.nominatorCountMetric = new PromClient.Gauge({
                name: "runtime_nominator_count",
                help: "Total number of nominators in staking system",
                labelNames: ["type", "chain"]
            })

            this.validatorCountMetric = new PromClient.Gauge({
                name: "runtime_validator_count",
                help: "Total number of validators in staking system",
                labelNames: ["type", "chain"]
            })

            registry.registerMetric(this.nominatorCountMetric);
            registry.registerMetric(this.validatorCountMetric);

        }
    }

    async writeNominatorCount(time: number, myChain: string, myCount: number, withProm: boolean) {

        const result = await this.nominatorCountSql.create(
            {
                time: time,
                chain: myChain,
                nominatorcount: myCount
            }, { fields: ['time', 'chain', 'nominatorcount'] },
            { tableName: 'runtime_nominator_count' });

        if (this.withProm) {
            this.nominatorCountMetric.set({ type: "intention", chain: myChain }, myCount);
        }
    }

    async writeValidatorCount(time: number, myChain: string, myCount: number, withProm: boolean) {

        const resultB = await this.validatorCountSql.create(
            {
                time: time,
                chain: myChain,
                validatorcount: myCount
            }, { fields: ['time', 'chain', 'validatorcount'] },
            { tableName: 'runtime_validator_count' });

        if (this.withProm) {
            this.validatorCountMetric.set({ chain: myChain }, myCount);
            this.validatorCountMetric.set({ type: "intention", chain: myChain }, myCount);

        }
    }

    async clean(api: ApiPromise, myChain: string, startingBlockTime: Date, endingBlockTime: Date) {

        await super.cleanData(api, this.nominatorCountSql, myChain, startingBlockTime, endingBlockTime)
        await super.cleanData(api, this.validatorCountSql, myChain, startingBlockTime, endingBlockTime)

    }

    async doWork(exporter: Staking, api: ApiPromise, indexBlock: number, chainName: string) {

        const blockHash = await api.rpc.chain.getBlockHash(indexBlock);
        const apiAt = await api.at(blockHash);
        let timestamp = (await api.query.timestamp.now.at(blockHash)).toNumber();

        try {

            let nominatorCount = (await apiAt.query.staking.counterForNominators()).toNumber();
            let validatorCount = (await apiAt.query.staking.counterForValidators()).toNumber();

            exporter.writeValidatorCount(timestamp, chainName.toString(), validatorCount, exporter.withProm);
            exporter.writeNominatorCount(timestamp, chainName.toString(), nominatorCount, exporter.withProm);

        } catch (error) {
            logger.debug(`error with staking ${this.workerPath}`)

        }

    }
}

async function run() {
    await launchLoading(exporter);
}

const registry = new PromClient.Registry();
let exporter = new Staking(STAKING_WORKER_PATH, registry, false);
run();
