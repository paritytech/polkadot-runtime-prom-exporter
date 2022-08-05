import BN from "bn.js";
import { ApiDecoration } from "@polkadot/api/types";
import parachains_load_history from './parachains_load_history.json'
import parachains from "./parachains.json";
import parachainsids from "./parachains-ids.json";
import { logger } from "./logger";
import { ApiPromise, WsProvider } from "@polkadot/api";


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
	timezone: '-10:00', // for writing to database
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

export function getParachainLoadHistoryParams(chain: string) {

	let i = 0;
	for (const [key, value] of Object.entries(parachains_load_history)) {

		if (chain == value[i].chain) {
			const startingBlock = (value[i].startingBlock);
			const endingBlock = value[i].endingBlock;
			const pallets = value[i].pallets
			if ((startingBlock - endingBlock) % 100 != 0) {
				logger.debug(`ERROR!, exit, (starting block - ending block) must be multiple of 100 in parachains_load_history.json`);
				return [0, 0, ""] as const;
			}
			logger.debug(`loading historical data for chain ${value[i].chain}, starting block: ${startingBlock} , ending: ${endingBlock}`);
			return [startingBlock, endingBlock, pallets] as const;
		}
		i++;
	}
	logger.debug(`no parachain settings for chain ${chain} parachains_load_history.json`);
	return [0, 0, ""] as const;

}

export function isPalletRequiredByHistoryConfig(palletsArr: string[], palletName: string) {

	let result = false;
	if (palletsArr[0].length > 0) {
		palletsArr.forEach((x, i) => {  if (x === palletName) { result = true } });
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
