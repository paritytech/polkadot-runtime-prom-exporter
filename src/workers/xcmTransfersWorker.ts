import { ApiPromise } from '@polkadot/api';
import { config } from 'dotenv';
import { decimals, sequelizeParams, offset } from '../utils';
import * as PromClient from 'prom-client';
import { CTimeScaleExporter } from './CTimeScaleExporter';
import { XCM_TRANSFERS_WORKER_PATH } from './workersPaths';
import { launchLoading } from './LoadHistory';
import { getParachainName } from '../utils';
import { logger } from '../logger';

config();
const connectionString = process.env.TSDB_CONN || '';
const Sequelize = require('sequelize');
const sequelize =
	connectionString != ''
		? new Sequelize(connectionString, { sequelizeParams, logging: false })
		: null;

export class XCMTransfers extends CTimeScaleExporter {
	XCMTransferSql: typeof Sequelize;
	xcmTransfersMetric: any;
	withProm: boolean;
	withTs: boolean;
	registry: PromClient.Registry;

	constructor(workerPath: string, registry: PromClient.Registry, withProm: boolean) {
		super(workerPath);
		this.registry = registry;
		this.withProm = withProm;
		this.withTs = connectionString == '' ? false : true;

		if (this.withTs) {
			this.XCMTransferSql = sequelize.define(
				'runtime_xcm_transfers',
				{
					time: { type: Sequelize.DATE, primaryKey: true },
					chain: { type: Sequelize.STRING, primaryKey: true },
					transferamount: { type: Sequelize.DOUBLE }
				},
				{ timestamps: false, freezeTableName: true }
			);
		}

		if (this.withProm) {
			this.xcmTransfersMetric = new PromClient.Gauge({
				name: 'runtime_xcm_transfers',
				help: 'Total of XCM transfers.',
				labelNames: ['chain', 'tochain']
			});

			registry.registerMetric(this.xcmTransfersMetric);
		}
	}

	async write(time: number, myChain: string, transferAmount: number, withProm: boolean) {
		if (this.withTs) {
			const result = await this.XCMTransferSql.create(
				{
					time: time,
					chain: myChain,
					transferamount: transferAmount
				},
				{ fields: ['time', 'chain', 'transferamount'] },
				{ tableName: 'runtime_xcm_transfers' }
			);
		}

		if (this.withProm) {
			this.xcmTransfersMetric.set({ chain: myChain }, transferAmount);
		}
	}

	async clean(myChainName: string, startingBlockTime: Date, endingBlockTime: Date) {
		await super.cleanData(this.XCMTransferSql, myChainName, startingBlockTime, endingBlockTime);
	}

	async doWork(exporter: XCMTransfers, api: ApiPromise, indexBlock: number, chainName: string) {
		const blockHash = await api.rpc.chain.getBlockHash(indexBlock);
		const apiAt = await api.at(blockHash);
		let timestamp = (await api.query.timestamp.now.at(blockHash)).toNumber();
		//timestamp -= offset;

		const signed_block = await api.rpc.chain.getBlock(blockHash);

		signed_block.block.extrinsics.forEach((ex, index) => {
			const {
				isSigned,
				meta,
				method: { args, method, section }
			} = ex;

			if (section == 'xcmPallet') {
				const obj = JSON.parse(ex.toString());

				let paraChainName = '';
				let transferAmount = 0.0;

				try {
					paraChainName = getParachainName(obj.method.args.dest.v1.interior.x1.parachain);
				} catch (error) {
					try {
						paraChainName = getParachainName(obj.method.args.dest.v0.x1.parachain);
					} catch (error) {
						logger.debug(`error with parachain ${error}`);
					}
				}

				try {
					let myAmount = (
						obj.method.args.assets.v1[0].fun.fungible / decimals(api).toNumber()
					).toFixed(2);
					transferAmount = parseFloat(myAmount);
				} catch (error) {
					try {
						let myAmount = (
							obj.method.args.assets.v0[0].concreteFungible.amount / decimals(api).toNumber()
						).toFixed(2);
						transferAmount = parseFloat(myAmount);
					} catch (error) {
						logger.debug(`error with amount ${error}`);
					}
				}

				exporter.write(timestamp, chainName.toString(), transferAmount, exporter.withProm);
			}
		});
	}
}

async function run() {
	await launchLoading(exporter);
}

const registry = new PromClient.Registry();
let exporter = new XCMTransfers(XCM_TRANSFERS_WORKER_PATH, registry, false);
run();
