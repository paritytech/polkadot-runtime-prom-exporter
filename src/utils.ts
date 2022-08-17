import BN from "bn.js";
import { ApiDecoration } from "@polkadot/api/types";
import parachainsHistory from './config.json'
import parachainsids from "./parachains-ids.json";
import { logger } from "./logger";
import { ApiPromise } from "@polkadot/api";

const parachainsLoadHistory = parachainsHistory.history;

export const DEFAULT_TIMEOUT = 30 * 60 * 1000;

//offset -8H to fix
export const offset = 8 * 60 * 60 * 1000;

export const sequelizeParams = {
	dialect: 'postgres',
	protocol: 'postgres',
	logging: false,
	dialectOptions: {
		useUTC: false, // for reading from database
	},
	timezone: '-10:00', // for writing to database,
	pool: {
		max: 600,
		min: 0,
		acquire: 60000,
		idle: 30000
	}

};

export async function getTimeOfBlock(api: ApiDecoration<"promise">, blockHash: string) {

	let blockTime = (await api.query.timestamp.now.at(blockHash)).toNumber();
	return new Date(blockTime);

}

export function decimals(api: ApiDecoration<"promise">): BN {
	try {
		return new BN(Math.pow(10, api.registry.chainDecimals[0]))
	}
	catch (error) {
		logger.debug(`function decimals error ${error}`)

		return new BN(0);
	}
}

export function getParachainName(mykey: string): string {
	for (const [key, value] of Object.entries(parachainsids)) {
		if (mykey == key) {
			return value;
		}
	}
	return mykey;
}

export function getDistanceBetweenBlocks(distanceBetweenBlocks: any, exporterName: string) {

	for (const [key, value] of Object.entries(distanceBetweenBlocks)) {
		let result = JSON.stringify(Object.values(distanceBetweenBlocks)[parseInt(key)]);
		let obj = JSON.parse(result);
		if (obj.pallet == exporterName) {
			return obj.dist;
		}
	}
	return 1;
}
export function getParachainLoadHistoryParams(chain: string) {

	let i = 0;

	for (const [key, value] of Object.entries(parachainsLoadHistory)) {
		if (chain == value.chain) {
			const startingBlock = (value.startingBlock);
			const endingBlock = value.endingBlock;
			const pallets = value.pallets;
			const distanceBetweenBlocks = value.distanceBetweenBlocks;
			if ((startingBlock - endingBlock) % 100 != 0) {
				logger.debug(`ERROR!, exit, (starting block - ending block) must be multiple of 100 in config.json`);
				return [{}, 0, 0, ""] as const;
			}
			logger.debug(`found record for loading historical data for chain ${value.chain}, ${pallets}, starting at #${startingBlock}, ending at #${endingBlock}`);
			return [distanceBetweenBlocks, startingBlock, endingBlock, pallets] as const;
		}
		i++;
	}
	logger.debug(`no parachain settings for chain ${chain} config.json`);
	return [{}, 0, 0, ""] as const;

}

// returns true if pallet in the load_history_config.json or is field is empty (loads all pallets when field is empty)
export function isPalletRequiredByHistoryConfig(palletsArr: string[], palletName: string) {

	let result = false;
	if (palletsArr[0].length > 0) {
		palletsArr.forEach((x, i) => { if (x === palletName) { result = true } });
	} else {
		//if the array is empty then run all the exporters
		result = true;
	}
	return result;;
}

export async function getFinalizedApi(api: ApiPromise): Promise<ApiDecoration<"promise">> {
	const finalized = await api.rpc.chain.getFinalizedHead();
	return await api.at(finalized)
}
