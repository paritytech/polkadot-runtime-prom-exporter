import { ApiPromise } from "@polkadot/api";
import { config } from "dotenv";
import { decimals, sequelizeParams, offset } from '../utils'
import * as PromClient from "prom-client"
import { CTimeScaleExporter } from './CTimeScaleExporter';
import { STAKING_MINER_ACCOUNT_WORKER_PATH } from './workersPaths'
import { launchLoading } from './LoadHistory'
import { logger } from '../logger';

const BALANCE_A_ADDRESS = 'GtGGqmjQeRt7Q5ggrjmSHsEEfeXUMvPuF8mLun2ApaiotVr';
const BALANCE_B_ADDRESS = 'GtGGqmjQeRt7Q5ggrjmSHsEEfeXUMvPuF8mLun2ApaiotVr';

config();
const connectionString = process.env.TSDB_CONN || "";
const Sequelize = require('sequelize');
const sequelize = (connectionString != "") ? new Sequelize(connectionString, { sequelizeParams, logging: false }) : null;

export class StakingMinerAccount extends CTimeScaleExporter {
    stakingMinerBalanceASql: typeof Sequelize;
    stakingMinerBalanceBSql: typeof Sequelize;
    balanceAMetric: any;
    balanceBMetric: any;

    withProm: boolean;
    withTs: boolean;
    registry: PromClient.Registry;

    constructor(workerPath: string, registry: PromClient.Registry, withProm: boolean) {

        super(workerPath);
        this.registry = registry;
        this.withProm = withProm;
        this.withTs = (connectionString == "" ? false : true);

        if (this.withTs) {

            this.stakingMinerBalanceASql = sequelize.define("runtime_balance_a", {
                time: { type: Sequelize.DATE, primaryKey: true },
                chain: { type: Sequelize.STRING, primaryKey: true },
                balance: { type: Sequelize.INTEGER },
            }, { timestamps: false, freezeTableName: true });


            this.stakingMinerBalanceBSql = sequelize.define("runtime_balance_b", {
                time: { type: Sequelize.DATE, primaryKey: true },
                chain: { type: Sequelize.STRING, primaryKey: true },
                balance: { type: Sequelize.INTEGER },
            }, { timestamps: false, freezeTableName: true });
        }
        if (this.withProm) {

            // balances A
            this.balanceAMetric = new PromClient.Gauge({
                name: "runtime_balance_a",
                help: "balance of a specific account a",
                labelNames: ["type", "chain"]

            })
            // balances B
            this.balanceBMetric = new PromClient.Gauge({
                name: "runtime_balance_b",
                help: "balance of a specific account b",
                labelNames: ["type", "chain"]
            })

            registry.registerMetric(this.balanceAMetric);
            registry.registerMetric(this.balanceBMetric);

        }
    }

    async writeA(time: number, myChain: string, balance: number, withProm: boolean) {

        if (this.withTs) {
            const resultA = await this.stakingMinerBalanceASql.create(
                {
                    time: time,
                    chain: myChain,
                    balance: balance
                }, { fields: ['time', 'chain', 'balance'] },
                { tableName: 'runtime_balance_a' });
        }

        if (this.withProm) {
            this.balanceAMetric.set({ chain: myChain }, balance);
        }
    }

    async writeB(time: number, myChain: string, balance: number, withProm: boolean) {

        if (this.withTs) {

            const resultB = await this.stakingMinerBalanceBSql.create(
                {
                    time: time,
                    chain: myChain,
                    balance: balance
                }, { fields: ['time', 'chain', 'balance'] },
                { tableName: 'runtime_balance_b' });
        }

        if (this.withProm) {
            this.balanceBMetric.set({ chain: myChain }, balance);
        }
    }

    async clean(myChainName: string, startingBlockTime: Date, endingBlockTime: Date) {
        await super.cleanData(this.stakingMinerBalanceASql, myChainName, startingBlockTime, endingBlockTime)
        await super.cleanData(this.stakingMinerBalanceBSql, myChainName, startingBlockTime, endingBlockTime)
    }

    async doWork(exporter: StakingMinerAccount, api: ApiPromise, indexBlock: number, chainName: string) {

        const blockHash = await api.rpc.chain.getBlockHash(indexBlock);
        const apiAt = await api.at(blockHash);
        let timestamp = (await api.query.timestamp.now.at(blockHash)).toNumber();


        try {
            let balanceA = (await apiAt.query.system.account(BALANCE_A_ADDRESS));
            let balanceB = (await apiAt.query.system.account(BALANCE_B_ADDRESS));

            if (balanceA.data.free != null) {
                await exporter.writeA(timestamp, chainName.toString(), (balanceA.data.free.toBn().div(decimals(api))).toNumber(), exporter.withProm);
            } else {
                await exporter.writeA(timestamp, chainName.toString(), 0, exporter.withProm);
            }
            if (balanceB.data.free != null) {
                await exporter.writeB(timestamp, chainName.toString(), (balanceB.data.free.toBn().div(decimals(api))).toNumber(), exporter.withProm);
            }
            else {
                await exporter.writeB(timestamp, chainName.toString(), 0, exporter.withProm);
            }
        } catch (error) {
            logger.debug(`error with stakingMinerAccount ${this.workerPath}`)
            await exporter.writeA(timestamp, chainName.toString(), 0, exporter.withProm);
            await exporter.writeB(timestamp, chainName.toString(), 0, exporter.withProm);

        }

    }
}

async function run() {
    await launchLoading(exporter);
}

const registry = new PromClient.Registry();
let exporter = new StakingMinerAccount(STAKING_MINER_ACCOUNT_WORKER_PATH, registry, false);
run();
