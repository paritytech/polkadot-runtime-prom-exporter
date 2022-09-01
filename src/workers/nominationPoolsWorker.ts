import { ApiPromise } from '@polkadot/api';
import { sequelizeParams } from '../utils';
import * as PromClient from 'prom-client';
import { CTimeScaleExporter } from './CTimeScaleExporter';
import { NOMINATION_POOLS_WORKER_PATH } from './workersPaths';
import { launchLoading } from './LoadHistory';
import BN from 'bn.js';
import { bnToU8a, u8aConcat } from '@polkadot/util';
import '@polkadot/api-augment';
import { AccountId32 } from '@polkadot/types/interfaces';
import { logger } from '../logger';

const { stringToU8a } = require('@polkadot/util');

const connectionString = process.env.TSDB_CONN || '';
const Sequelize = require('sequelize');
const sequelize =
	connectionString != ''
		? new Sequelize(connectionString, { sequelizeParams, logging: false })
		: null;

export class NominationPools extends CTimeScaleExporter {
	poolIdSql: typeof Sequelize;
	membersSql: typeof Sequelize;
	totalPointsSql: typeof Sequelize;
	totalBalanceSql: typeof Sequelize;
	unbondingBalanceSql: typeof Sequelize;
	pendingRewardsSql: typeof Sequelize;

	poolIdMetric: any;
	membersMetric: any;
	totalPointsMetric: any;
	totalBalanceMetric: any;
	unbondingBalanceMetric: any;
	pendingRewardsMetric: any;

	withProm: boolean;
	withTs: boolean;
	registry: PromClient.Registry;

	constructor(workerPath: string, registry: PromClient.Registry, withProm: boolean) {
		super(workerPath);
		this.registry = registry;
		this.withProm = withProm;
		this.withTs = connectionString == '' ? false : true;

		if (this.withTs) {
			this.poolIdSql = sequelize.define(
				'runtime_nom_pools_pool_id',
				{
					time: { type: Sequelize.DATE, primaryKey: true },
					chain: { type: Sequelize.STRING, primaryKey: true },
					poolid: { type: Sequelize.INTEGER }
				},
				{ timestamps: false, freezeTableName: true }
			);

			this.membersSql = sequelize.define(
				'runtime_nom_pools_members',
				{
					time: { type: Sequelize.DATE, primaryKey: true },
					chain: { type: Sequelize.STRING, primaryKey: true },
					members: { type: Sequelize.INTEGER }
				},
				{ timestamps: false, freezeTableName: true }
			);

			this.totalPointsSql = sequelize.define(
				'runtime_nom_pools_total_points',
				{
					time: { type: Sequelize.DATE, primaryKey: true },
					chain: { type: Sequelize.STRING, primaryKey: true },
					totalpoints: { type: Sequelize.BIGINT }
				},
				{ timestamps: false, freezeTableName: true }
			);

			this.totalBalanceSql = sequelize.define(
				'runtime_nom_pools_total_balance',
				{
					time: { type: Sequelize.DATE, primaryKey: true },
					chain: { type: Sequelize.STRING, primaryKey: true },
					totalbalance: { type: Sequelize.BIGINT }
				},
				{ timestamps: false, freezeTableName: true }
			);

			this.unbondingBalanceSql = sequelize.define(
				'runtime_nom_pools_unbonding_balance',
				{
					time: { type: Sequelize.DATE, primaryKey: true },
					chain: { type: Sequelize.STRING, primaryKey: true },
					unbondingbalance: { type: Sequelize.BIGINT }
				},
				{ timestamps: false, freezeTableName: true }
			);

			this.pendingRewardsSql = sequelize.define(
				'runtime_nom_pools_pending_rewards',
				{
					time: { type: Sequelize.DATE, primaryKey: true },
					chain: { type: Sequelize.STRING, primaryKey: true },
					pendingrewards: { type: Sequelize.BIGINT }
				},
				{ timestamps: false, freezeTableName: true }
			);
		}
		if (this.withProm) {
			this.poolIdMetric = new PromClient.Gauge({
				name: 'runtime_nom_pools_pool_id',
				help: 'the pools ids, updated per block',
				labelNames: ['type', 'chain']
			});
			registry.registerMetric(this.poolIdMetric);

			this.membersMetric = new PromClient.Gauge({
				name: 'runtime_nom_pools_members',
				help: 'number of members of pools, updated per block',
				labelNames: ['type', 'chain']
			});
			registry.registerMetric(this.membersMetric);

			this.totalPointsMetric = new PromClient.Gauge({
				name: 'runtime_nom_pools_total_points',
				help: 'the total points of pools, updated per block',
				labelNames: ['type', 'chain']
			});
			registry.registerMetric(this.totalPointsMetric);

			this.totalBalanceMetric = new PromClient.Gauge({
				name: 'runtime_nom_pools_total_balance',
				help: 'the total balance of pools, updated per block',
				labelNames: ['type', 'chain']
			});
			registry.registerMetric(this.totalBalanceMetric);

			this.unbondingBalanceMetric = new PromClient.Gauge({
				name: 'runtime_nom_pools_unbonding_balance',
				help: 'the unbonding balance of pools, updated per block',
				labelNames: ['type', 'chain']
			});
			registry.registerMetric(this.unbondingBalanceMetric);

			this.pendingRewardsMetric = new PromClient.Gauge({
				name: 'runtime_nom_pools_pending_rewards',
				help: 'pending rewards of pools, updated per block',
				labelNames: ['type', 'chain']
			});
			registry.registerMetric(this.pendingRewardsMetric);
		}
	}

	async writePoolId(time: number, myChain: string, poolId: number, withProm: boolean) {
		if (this.withTs) {
			const result = await this.poolIdSql.create(
				{
					time: time,
					chain: myChain,
					poolid: poolId
				},
				{ fields: ['time', 'chain', 'poolid'] },
				{ tableName: 'runtime_nom_pools_pool_id' }
			);
		}

		if (this.withProm) {
			this.poolIdMetric.set({ chain: myChain }, poolId);
		}
	}

	async writeMembers(time: number, myChain: string, members: number, withProm: boolean) {
		if (this.withTs) {
			const result = await this.membersSql.create(
				{
					time: time,
					chain: myChain,
					members: members
				},
				{ fields: ['time', 'chain', 'members'] },
				{ tableName: 'runtime_nom_pools_members' }
			);
		}

		if (this.withProm) {
			this.membersMetric.set({ chain: myChain }, members);
		}
	}
	async writeTotalPoints(time: number, myChain: string, totalPoints: number, withProm: boolean) {
		if (this.withTs) {
			const result = await this.totalPointsSql.create(
				{
					time: time,
					chain: myChain,
					totalpoints: totalPoints
				},
				{ fields: ['time', 'chain', 'totalpoints'] },
				{ tableName: 'runtime_nom_pools_total_points' }
			);
		}

		if (this.withProm) {
			this.totalPointsMetric.set({ chain: myChain }, totalPoints);
		}
	}

	async writeTotalBalance(time: number, myChain: string, totalBalance: number, withProm: boolean) {
		if (this.withTs) {
			const result = await this.totalBalanceSql.create(
				{
					time: time,
					chain: myChain,
					totalbalance: totalBalance
				},
				{ fields: ['time', 'chain', 'totalbalance'] },
				{ tableName: 'runtime_nom_pools_total_balance' }
			);
		}

		if (this.withProm) {
			this.totalBalanceMetric.set({ chain: myChain }, totalBalance);
		}
	}
	async writeUnbondingBalance(
		time: number,
		myChain: string,
		unbondingBalance: number,
		withProm: boolean
	) {
		if (this.withTs) {
			const result = await this.unbondingBalanceSql.create(
				{
					time: time,
					chain: myChain,
					unbondingbalance: unbondingBalance
				},
				{ fields: ['time', 'chain', 'unbondingbalance'] },
				{ tableName: 'runtime_nom_pools_unbonding_balance' }
			);
		}

		if (this.withProm) {
			this.unbondingBalanceMetric.set({ chain: myChain }, unbondingBalance);
		}
	}
	async writePendingRewards(
		time: number,
		myChain: string,
		pendingRewards: number,
		withProm: boolean
	) {
		if (this.withTs) {
			const result = await this.pendingRewardsSql.create(
				{
					time: time,
					chain: myChain,
					pendingrewards: pendingRewards
				},
				{ fields: ['time', 'chain', 'pendingrewards'] },
				{ tableName: 'runtime_nom_pools_pending_rewards' }
			);
		}

		if (this.withProm) {
			this.pendingRewardsMetric.set({ chain: myChain }, pendingRewards);
		}
	}

	async clean(myChainName: string, startingBlockTime: Date, endingBlockTime: Date) {
		await super.cleanData(this.poolIdSql, myChainName, startingBlockTime, endingBlockTime);
		await super.cleanData(this.membersSql, myChainName, startingBlockTime, endingBlockTime);
		await super.cleanData(this.totalPointsSql, myChainName, startingBlockTime, endingBlockTime);
		await super.cleanData(this.totalBalanceSql, myChainName, startingBlockTime, endingBlockTime);
		await super.cleanData(
			this.unbondingBalanceSql,
			myChainName,
			startingBlockTime,
			endingBlockTime
		);
		await super.cleanData(this.pendingRewardsSql, myChainName, startingBlockTime, endingBlockTime);
	}

	async doWork(exporter: NominationPools, api: ApiPromise, indexBlock: number, chainName: string) {
		const blockHash = await api.rpc.chain.getBlockHash(indexBlock);
		const apiAt = await api.at(blockHash);
		//const timestamp = (await api.query.timestamp.now.at(blockHash)).toNumber();

		const timestamp = (await apiAt.query.timestamp.now()).toNumber();

		function createAccount(palletId: Uint8Array, poolId: BN, index: number): AccountId32 {
			const EMPTY_H256 = new Uint8Array(32);
			const MOD_PREFIX = stringToU8a('modl');
			const U32_OPTS = { bitLength: 32, isLe: true };
			return apiAt.registry.createType(
				'AccountId32',
				u8aConcat(
					MOD_PREFIX,
					palletId,
					new Uint8Array([index]),
					bnToU8a(poolId, U32_OPTS),
					EMPTY_H256
				)
			);
		}
		// count of all nomination pools.
		const poolsCount = await apiAt.query.nominationPools.counterForBondedPools();
		// count of all members.
		const membersCount = await apiAt.query.nominationPools.counterForPoolMembers();
		// details of each pool, [{ poolId, memberCount, totalPoints, totalStake, unbondingStake pendingRewards }]
		const PoolsDetail = await Promise.all(
			(
				await apiAt.query.nominationPools.bondedPools.entries()
			).map(async ([key, bondedPool]) => {
				const poolId = key.args[0];
				const members = bondedPool.unwrapOrDefault().memberCounter;
				const totalPoints = bondedPool.unwrapOrDefault().points;
				const palletId = apiAt.consts.nominationPools.palletId.toU8a();
				const rewardAccount = createAccount(palletId, poolId, 1);
				const bondedAccount = createAccount(palletId, poolId, 0);
				const existentialDeposit = apiAt.consts.balances.existentialDeposit;
				const pendingRewards = (await apiAt.query.system.account(rewardAccount)).data.free.sub(
					existentialDeposit
				);
				const ctrl = (await apiAt.query.staking.bonded(bondedAccount)).unwrap();
				const ledger = (await apiAt.query.staking.ledger(ctrl)).unwrap();
				const totalBalance = ledger.total.toBn();
				const unbondingBalance = ledger.total.toBn().sub(ledger.total.toBn());

				await exporter.writePoolId(
					timestamp,
					chainName.toString(),
					poolId.toNumber(),
					exporter.withProm
				);
				await exporter.writeMembers(
					timestamp,
					chainName.toString(),
					members.toNumber(),
					exporter.withProm
				);
				await exporter.writeTotalPoints(
					timestamp,
					chainName.toString(),
					totalPoints.toNumber(),
					exporter.withProm
				);
				await exporter.writeTotalBalance(
					timestamp,
					chainName.toString(),
					totalBalance.toNumber(),
					exporter.withProm
				);
				await exporter.writeUnbondingBalance(
					timestamp,
					chainName.toString(),
					unbondingBalance.toNumber(),
					exporter.withProm
				);
				await exporter.writePendingRewards(
					timestamp,
					chainName.toString(),
					pendingRewards.toNumber(),
					exporter.withProm
				);
			})
		);
	}
}

async function run() {
	await launchLoading(exporter);
}

const registry = new PromClient.Registry();
let exporter = new NominationPools(NOMINATION_POOLS_WORKER_PATH, registry, false);
run();
