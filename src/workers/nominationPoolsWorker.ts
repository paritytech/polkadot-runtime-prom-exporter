import { ApiPromise } from "@polkadot/api";
import { sequelizeParams } from '../utils'
import * as PromClient from "prom-client"
import { CTimeScaleExporter } from './CTimeScaleExporter';
import { NOMINATION_POOLS_WORKER_PATH } from './workersPaths'
import { launchLoading } from './LoadHistory'
import BN from "bn.js";
import { bnToU8a, u8aConcat } from '@polkadot/util';
import '@polkadot/api-augment';
import { AccountId32 } from "@polkadot/types/interfaces";
import { logger } from '../logger';

const { stringToU8a } = require('@polkadot/util');

const connectionString = process.env.TSDB_CONN || "";
const Sequelize = require('sequelize');
const sequelize = (connectionString != "") ? new Sequelize(connectionString, { sequelizeParams, logging: false }) : null;

export class NominationPools extends CTimeScaleExporter {

    membersSql: typeof Sequelize;
    totalPointsSql: typeof Sequelize;
    totalBalanceSql: typeof Sequelize;
    unbondingBalanceSql: typeof Sequelize;
    pendingRewardsSql: typeof Sequelize;
    poolsCountSql: typeof Sequelize;
    membersCountSql: typeof Sequelize;

    membersMetric: any;
    totalPointsMetric: any;
    totalBalanceMetric: any;
    unbondingBalanceMetric: any;
    pendingRewardsMetric: any;
    poolsCountMetric: any;
    membersCountMetric: any;

    withProm: boolean;
    withTs: boolean;
    registry: PromClient.Registry;

    constructor(workerPath: string, registry: PromClient.Registry, withProm: boolean) {

        super(workerPath);
        this.registry = registry;
        this.withProm = withProm;
        this.withTs = (connectionString == "" ? false : true);

        if (this.withTs) {

            this.membersSql = sequelize.define("runtime_nom_pools_members", {
                time: { type: Sequelize.DATE, primaryKey: true },
                chain: { type: Sequelize.STRING, primaryKey: true },
                members: { type: Sequelize.INTEGER },
                pool: { type: Sequelize.INTEGER },
            }, { timestamps: false, freezeTableName: true });

            this.totalPointsSql = sequelize.define("runtime_nom_pools_total_points", {
                time: { type: Sequelize.DATE, primaryKey: true },
                chain: { type: Sequelize.STRING, primaryKey: true },
                totalpoints: { type: Sequelize.BIGINT },
                pool: { type: Sequelize.INTEGER },
            }, { timestamps: false, freezeTableName: true });

            this.totalBalanceSql = sequelize.define("runtime_nom_pools_total_balance", {
                time: { type: Sequelize.DATE, primaryKey: true },
                chain: { type: Sequelize.STRING, primaryKey: true },
                totalbalance: { type: Sequelize.BIGINT },
                pool: { type: Sequelize.INTEGER },
            }, { timestamps: false, freezeTableName: true });

            this.unbondingBalanceSql = sequelize.define("runtime_nom_pools_unbonding_balance", {
                time: { type: Sequelize.DATE, primaryKey: true },
                chain: { type: Sequelize.STRING, primaryKey: true },
                unbondingbalance: { type: Sequelize.BIGINT },
                pool: { type: Sequelize.INTEGER },
            }, { timestamps: false, freezeTableName: true });

            this.pendingRewardsSql = sequelize.define("runtime_nom_pools_pending_rewards", {
                time: { type: Sequelize.DATE, primaryKey: true },
                chain: { type: Sequelize.STRING, primaryKey: true },
                pendingrewards: { type: Sequelize.BIGINT },
                pool: { type: Sequelize.INTEGER },
            }, { timestamps: false, freezeTableName: true });

            this.poolsCountSql = sequelize.define("runtime_nom_pools_count", {
                time: { type: Sequelize.DATE, primaryKey: true },
                chain: { type: Sequelize.STRING, primaryKey: true },
                poolscount: { type: Sequelize.INTEGER },
            }, { timestamps: false, freezeTableName: true });  

            this.membersCountSql = sequelize.define("runtime_nom_pools_members_count", {
                time: { type: Sequelize.DATE, primaryKey: true },
                chain: { type: Sequelize.STRING, primaryKey: true },
                memberscount: { type: Sequelize.INTEGER },
            }, { timestamps: false, freezeTableName: true });          
        }
        if (this.withProm) {
         
            this.membersMetric = new PromClient.Gauge({
                name: "runtime_nom_pools_members",
                help: "number of members of pools, updated per block",
                labelNames: ["type", "chain", "pool"]
            })
            registry.registerMetric(this.membersMetric);

            this.totalPointsMetric = new PromClient.Gauge({
                name: "runtime_nom_pools_total_points",
                help: "the total points of pools, updated per block",
                labelNames: ["type", "chain", "pool"]
            })
            registry.registerMetric(this.totalPointsMetric);

            this.totalBalanceMetric = new PromClient.Gauge({
                name: "runtime_nom_pools_total_balance",
                help: "the total balance of pools, updated per block",
                labelNames: ["type", "chain", "pool"]
            })
            registry.registerMetric(this.totalBalanceMetric);

            this.unbondingBalanceMetric = new PromClient.Gauge({
                name: "runtime_nom_pools_unbonding_balance",
                help: "the unbonding balance of pools, updated per block",
                labelNames: ["type", "chain", "pool"]
            })
            registry.registerMetric(this.unbondingBalanceMetric);

            this.pendingRewardsMetric = new PromClient.Gauge({
                name: "runtime_nom_pools_pending_rewards",
                help: "pending rewards of pools, updated per block",
                labelNames: ["type", "chain", "pool"]
            })
            registry.registerMetric(this.pendingRewardsMetric);

            this.poolsCountMetric = new PromClient.Gauge({
                name: "runtime_nom_pools_count",
                help: "Total number of nomination pools",
                labelNames: ["type", "chain"]
            })
            registry.registerMetric(this.poolsCountMetric);

            this.membersCountMetric = new PromClient.Gauge({
                name: "runtime_nom_pools_members_count",
                help: "Total number of members for nomination pools",
                labelNames: ["type", "chain"]
            })
            registry.registerMetric(this.membersCountMetric);
        }
    }

  
    async writeMembers(time: number, myChain: string, members: number, poolId: number, withProm: boolean) {

        if (this.withTs) {
            const result = await this.membersSql.create(
                {
                    time: time,
                    chain: myChain,
                    members: members,
                    pool: poolId
                }, { fields: ['time', 'chain', 'members', 'pool'] },
                { tableName: 'runtime_nom_pools_members' });
        }

        if (this.withProm) {
            this.membersMetric.set({ chain: myChain, pool: poolId }, members);
        }
    }
    async writeTotalPoints(time: number, myChain: string, totalPoints: number, poolId: number, withProm: boolean) {

        if (this.withTs) {
            const result = await this.totalPointsSql.create(
                {
                    time: time,
                    chain: myChain,
                    totalpoints: totalPoints,
                    pool: poolId
                }, { fields: ['time', 'chain', 'totalpoints', 'pool'] },
                { tableName: 'runtime_nom_pools_total_points' });
        }

        if (this.withProm) {
            this.totalPointsMetric.set({ chain: myChain, pool: poolId }, totalPoints);
        }
    }

    async writeTotalBalance(time: number, myChain: string, totalBalance: number, poolId: number, withProm: boolean) {

        if (this.withTs) {
            const result = await this.totalBalanceSql.create(
                {
                    time: time,
                    chain: myChain,
                    totalbalance: totalBalance,
                    pool: poolId
                }, { fields: ['time', 'chain', 'totalbalance', 'pool'] },
                { tableName: 'runtime_nom_pools_total_balance' });
        }

        if (this.withProm) {
            this.totalBalanceMetric.set({ chain: myChain, pool: poolId }, totalBalance);
        }
    }
    async writeUnbondingBalance(time: number, myChain: string, unbondingBalance: number, poolId: number, withProm: boolean) {

        if (this.withTs) {
            const result = await this.unbondingBalanceSql.create(
                {
                    time: time,
                    chain: myChain,
                    unbondingbalance: unbondingBalance,
                    pool: poolId
                }, { fields: ['time', 'chain', 'unbondingbalance', 'pool'] },
                { tableName: 'runtime_nom_pools_unbonding_balance' });
        }

        if (this.withProm) {
            this.unbondingBalanceMetric.set({ chain: myChain, pool: poolId }, unbondingBalance);
        }
    }

    async writePendingRewards(time: number, myChain: string, pendingRewards: number, poolId: number, withProm: boolean) {

        if (this.withTs) {
            const result = await this.pendingRewardsSql.create(
                {
                    time: time,
                    chain: myChain,
                    pendingrewards: pendingRewards,
                    pool: poolId
                }, { fields: ['time', 'chain', 'pendingrewards', 'pool'] },
                { tableName: 'runtime_nom_pools_pending_rewards' });
        }

        if (this.withProm) {
            this.pendingRewardsMetric.set({ chain: myChain, pool: poolId }, pendingRewards);
        }
    }

    async writePoolsCount(time: number, myChain: string, poolsCount: number, withProm: boolean) {

        if (this.withTs) {
            const result = await this.poolsCountSql.create(
                {
                    time: time,
                    chain: myChain,
                    poolscount: poolsCount
                }, { fields: ['time', 'chain', 'poolscount'] },
                { tableName: 'runtime_nom_pools_count' });
        }

        if (this.withProm) {
            this.poolsCountMetric.set({ chain: myChain }, poolsCount);
        }
    }

    async writeMembersCount(time: number, myChain: string, membersCount: number, withProm: boolean) {

        if (this.withTs) {
            const result = await this.membersCountSql.create(
                {
                    time: time,
                    chain: myChain,
                    memberscount: membersCount
                }, { fields: ['time', 'chain', 'memberscount'] },
                { tableName: 'runtime_nom_pools_members_count' });
        }

        if (this.withProm) {
            this.membersCountMetric.set({ chain: myChain }, membersCount);
        }
    }


    async clean(myChainName: string, startingBlockTime: Date, endingBlockTime: Date) {

        await super.cleanData(this.membersSql, myChainName, startingBlockTime, endingBlockTime)
        await super.cleanData(this.totalPointsSql, myChainName, startingBlockTime, endingBlockTime)
        await super.cleanData(this.totalBalanceSql, myChainName, startingBlockTime, endingBlockTime)
        await super.cleanData(this.unbondingBalanceSql, myChainName, startingBlockTime, endingBlockTime)
        await super.cleanData(this.pendingRewardsSql, myChainName, startingBlockTime, endingBlockTime)
    }

    async doWork(exporter: NominationPools, api: ApiPromise, indexBlock: number, chainName: string) {

        const blockHash = await api.rpc.chain.getBlockHash(indexBlock);
        const apiAt = await api.at(blockHash);
        const timestamp = (await api.query.timestamp.now.at(blockHash)).toNumber();

        function createAccount( palletId: Uint8Array, poolId: BN, index: number): AccountId32 {
            const EMPTY_H256 = new Uint8Array(32);
            const MOD_PREFIX = stringToU8a('modl');
            const U32_OPTS = { bitLength: 32, isLe: true };
            return apiAt.registry.createType('AccountId32', u8aConcat(
                MOD_PREFIX,
                palletId,
                new Uint8Array([index]),
                bnToU8a(poolId, U32_OPTS),
                EMPTY_H256
            ));
        }
        //can be done on every block
        // count of all nomination pools.
        const poolsCount = await apiAt.query.nominationPools.counterForBondedPools();
        // count of all members.
        const membersCount = await apiAt.query.nominationPools.counterForPoolMembers();

        await exporter.writePoolsCount(timestamp, chainName.toString(), poolsCount.toNumber(), exporter.withProm);
        await exporter.writeMembersCount(timestamp, chainName.toString(), membersCount.toNumber(), exporter.withProm);

        // details of each pool, [{ poolId, memberCount, totalPoints, totalStake, unbondingStake pendingRewards }]
        const PoolsDetail = await Promise.all((await apiAt.query.nominationPools.bondedPools.entries()).map(async ([key, bondedPool]) => {
            const poolId = key.args[0];
            const members = bondedPool.unwrapOrDefault().memberCounter;
            const totalPoints = bondedPool.unwrapOrDefault().points;
            const palletId = apiAt.consts.nominationPools.palletId.toU8a();
            const rewardAccount = createAccount(palletId, poolId, 1);
            const bondedAccount = createAccount(palletId, poolId, 0);
            const existentialDeposit = apiAt.consts.balances.existentialDeposit;
            const pendingRewards = (await apiAt.query.system.account(rewardAccount)).data.free.sub(existentialDeposit);
            const ctrl = (await apiAt.query.staking.bonded(bondedAccount)).unwrap();
            const ledger = (await apiAt.query.staking.ledger(ctrl)).unwrap();
            const totalBalance = ledger.total.toBn();
            const unbondingBalance = ledger.total.toBn().sub(ledger.total.toBn());

            await exporter.writeMembers(timestamp, chainName.toString(), members.toNumber(), poolId.toNumber(), exporter.withProm);
            await exporter.writeTotalPoints(timestamp, chainName.toString(), totalPoints.toNumber(), poolId.toNumber(), exporter.withProm);
            await exporter.writeTotalBalance(timestamp, chainName.toString(), totalBalance.toNumber(), poolId.toNumber(), exporter.withProm);
            await exporter.writeUnbondingBalance(timestamp, chainName.toString(), unbondingBalance.toNumber(), poolId.toNumber(), exporter.withProm);
            await exporter.writePendingRewards(timestamp, chainName.toString(), pendingRewards.toNumber(), poolId.toNumber(), exporter.withProm);

        }));
    }
}

async function run() {
    await launchLoading(exporter);
}

const registry = new PromClient.Registry();
let exporter = new NominationPools(NOMINATION_POOLS_WORKER_PATH, registry, false);
run();
