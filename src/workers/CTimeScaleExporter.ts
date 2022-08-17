import { ApiPromise } from "@polkadot/api";
import { Worker, isMainThread } from 'worker_threads';
import { logger } from '../logger';
import { DEFAULT_TIMEOUT, sequelizeParams } from '../utils'
import { config } from "dotenv";
import { bool } from "@polkadot/types-codec";

config();
const connectionString = process.env.TSDB_CONN || "";
const Sequelize = require('sequelize');
const sequelize = (connectionString != "") ? new Sequelize(connectionString, { sequelizeParams, logging: false }) : null;

export class CTimeScaleExporter {
	workerPath: string;
	exportersVersionsSql: typeof Sequelize;
	chainName: string;

	constructor(public wPath: string) {

		this.workerPath = wPath;
		this.chainName = "";

		if (connectionString != "") {
			this.exportersVersionsSql = sequelize.define("exporters_versions", {
				time: { type: Sequelize.DATE, primaryKey: true },
				startingblock: { type: Sequelize.INTEGER },
				endingblock: { type: Sequelize.INTEGER },
				chain: { type: Sequelize.STRING, primaryKey: true },
				exporter: { type: Sequelize.STRING, primaryKey: true },
				version: { type: Sequelize.INTEGER },
				distancebb: { type: Sequelize.INTEGER },
			}, { timestamps: false, freezeTableName: true });
		}
	}


	async launchWorkers(threadsNumber: number,
		startingBlock: number,
		endingBlock: number,
		chain: string,
		exporterName: string,
		exporterVersion: number,
		chainName: string,
		distanceBB: number): Promise<any> {

		this.chainName = chainName;

		let myStartBlock = startingBlock;
		let numberOfBlocksPerThread = (startingBlock - endingBlock) / threadsNumber;
		logger.debug(`launch ${threadsNumber} workers for ${this.workerPath} ${chainName}`)
		const checkRecord = await this.findExporterRecord(this.chainName, exporterName, exporterVersion, startingBlock, endingBlock, distanceBB);

		var completedWorkers = 0;
		if (isMainThread) {

			for (let indexThread = 0; indexThread < threadsNumber; indexThread++) {

				const worker = new Worker(process.cwd() + this.workerPath, {
					workerData: {
						defaultTimeOut: DEFAULT_TIMEOUT,
						startBlock: myStartBlock,
						blockLimit: myStartBlock - numberOfBlocksPerThread,
						chain: chain,
						exporterName: exporterName,
						exporterVersion: exporterVersion,
						chainName: chainName,
						distanceBB: distanceBB
					}
				});

				myStartBlock = myStartBlock - numberOfBlocksPerThread;
				worker.on('message', (result) => {
					const myTime = new Date();
					completedWorkers++;

					logger.debug(`finished ${completedWorkers} worker(s) ${indexThread + 1}/${threadsNumber} of ${this.workerPath}, ${chainName}`)
					if (completedWorkers == threadsNumber) {
						logger.debug(`all finished for worker ${this.workerPath} ${chainName}`)
						if (checkRecord == false) {
							console.log('', chainName, exporterName, exporterVersion, startingBlock, endingBlock);
							this.writeExporterRecord(this.exportersVersionsSql, chainName, exporterName, exporterVersion, startingBlock, endingBlock, distanceBB);
						}
						else {
							logger.debug(`record already exists for ${chain} ${exporterName} version ${exporterVersion} ${startingBlock} ${endingBlock} `)
						}

					}
					worker.terminate();
				});
			}

		} else {
			logger.debug(`should return a promise from all calling paths`)
			return Promise.reject(new Error("Can only call encode() from main thread"));
		}
	}

	async writeExporterRecord(tableSql: typeof Sequelize, myChainName: string, myExporter: string, myVersion: number, startingBlock: number, endingBlock: number, distanceBB: number) {

		const timestamp = Date.now();

		if (this.exportersVersionsSql == undefined) {
			return;
		}

		//before storing the new record, we delete previous versions if there are, for the same exporter with same startingBlock and endingBlock 
		await this.cleanPreviousExporterRecord(this.exportersVersionsSql, myChainName, myExporter, startingBlock, endingBlock);

		console.log('distancebb before storage', distanceBB)
		//write to the exporters_versions table when finished 
		const result = this.exportersVersionsSql.create(
			{
				time: timestamp,
				startingblock: startingBlock,
				endingblock: endingBlock,
				chain: myChainName,
				exporter: myExporter,
				version: myVersion,
				distancebb: distanceBB
			}, { fields: ['time', 'startingblock', 'endingblock', 'chain', 'exporter', 'version', 'distancebb'] },
			{ tableName: 'exporters_versions' });
	}

	async cleanPreviousExporterRecord(tableSql: typeof Sequelize, myChainName: string, myExporter: string, startingBlock: number, endingBlock: number) {
		try {

			const { Op } = require("sequelize");
			const result = await tableSql.destroy({
				where: {
					chain: myChainName,
					startingblock: startingBlock,
					endingblock: endingBlock,
					exporter: myExporter
				}
			});

			logger.debug(`cleaned ${result} row(s) of exporters_versions ${this.workerPath}`);

		} catch (error) {
			logger.debug(`error from cleanData ${error} for exporter ${this.workerPath}`);
		}
	}

	async cleanData(tableSql: typeof Sequelize, myChainName: string, startingBlockTime: Date, endingBlockTime: Date) {

		try {

			const startBlockTime = startingBlockTime.setSeconds(startingBlockTime.getSeconds() + 1);

			const { Op } = require("sequelize");
			const result = await tableSql.destroy({
				where: {
					chain: myChainName,
					time: {
						[Op.lt]: startBlockTime,
						[Op.gt]: endingBlockTime
					}
				}
			});

			logger.debug(`cleaned ${result} rows for exporter ${this.workerPath}`);

		} catch (error) {
			logger.debug(`error from cleanData ${error} for exporter ${this.workerPath}`);
		}
	}

	//returns true if a record exists in the exporters_versions table with the same exporter name, version, starting and ending date
	// if the version is 0, then search for any type of version
	async findExporterRecord(myChainName: string, myExporter: string, myVersion: number, startingBlock: number, endingBlock: number, distanceBB: number) {

		try {
			const { Op } = require("sequelize");

			var result;
			//if version is 0, then search without version
			if (myVersion == 0) {
				result = await this.exportersVersionsSql.findAll({
					where: {
						chain: myChainName,
						exporter: myExporter,
						startingblock: startingBlock,
						endingblock: endingBlock,
						distancebb: distanceBB
					},
					raw: true
				});
			}
			//otherwise search with the version number
			else {
				result = await this.exportersVersionsSql.findAll({
					where: {
						chain: myChainName,
						exporter: myExporter,
						version: myVersion,
						startingblock: startingBlock,
						endingblock: endingBlock,
						distancebb: distanceBB
					},
					raw: true
				});
			}

			const foundIt = ((result.length == 0) ? false : true);

			return foundIt;

		} catch (error) {
			logger.debug(`error from cleanData ${error} for exporter ${this.workerPath}`);
		}
		return false;
	}

	async getExportersVersionsRecords(myChainName: string, myExporter: string, myVersion: number) {

		let historyRecords = new Map<string, [number, number, number, number]>();

		try {
			const { Op } = require("sequelize");
			const result = await this.exportersVersionsSql.findAll({
				where: {
					chain: myChainName,
					exporter: myExporter,

				},
				raw: true
			});

			for (var i = 0; i < result.length; i++) {
				if ((result[i]['chain'] === myChainName) && (result[i]['exporter'] === myExporter)) {
					historyRecords.set(myExporter, [result[i]['startingblock'], result[i]['endingblock'], myVersion, result[i]['distancebb']]);
				}
			}


		} catch (error) {
			logger.debug(`error from cleanData ${error} for exporter ${this.workerPath}`);
		}

		return historyRecords;

	}
}


