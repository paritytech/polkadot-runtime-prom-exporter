/// Something that wants to be an exporter of data.
import { ApiPromise } from "@polkadot/api";
import { Header } from "@polkadot/types/interfaces";
import { Worker, isMainThread } from 'worker_threads';
import { logger } from '../logger';

import { DEFAULT_TIMEOUT } from '../utils'

export class CTimeScaleExporter {
	workerPath: string;

	constructor(public wPath: string) {

		this.workerPath = wPath;
	}

	async launchWorkers(threadsNumber: number, startingBlock: number, endingBlock: number, chain: string): Promise<any> {

		let myStartBlock = startingBlock;
		let numberOfBlocksPerThread = (startingBlock - endingBlock) / threadsNumber;
		logger.debug(`launch workers for ${this.workerPath}`)

		if (isMainThread) {

			for (let indexThread = 0; indexThread < threadsNumber; indexThread++) {

				const worker = new Worker(process.cwd() + this.workerPath, {
					workerData: {
						defaultTimeOut: DEFAULT_TIMEOUT,
						startBlock: myStartBlock,
						blockLimit: myStartBlock - numberOfBlocksPerThread,
						chain: chain
					}
				});

				myStartBlock = myStartBlock - numberOfBlocksPerThread - 1;
				worker.on('message', (result) => {
					const myTime = new Date();
					logger.debug(`finished worker ${this.workerPath} at ${myTime}`)
				});
			}
		} else {
			logger.debug(`should return a promise from all calling paths`)
			return Promise.reject(new Error("Can only call encode() from main thread"));
		}
	}
}


