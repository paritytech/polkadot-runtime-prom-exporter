import { parentPort, workerData } from 'worker_threads';
import { ApiPromise, WsProvider } from "@polkadot/api";
import { logger } from '../logger';

export async function loadHistoryFromApi(exporter: any,
    doWorkfunc: Function,
    api: ApiPromise,
    startingBlock: number,
    blockLimit: number,
    chain: string,
    exporterName: string,
    distanceBB: number) {

    try {

        const chainName = await (await api.rpc.system.chain()).toString();
        for (let indexBlock = startingBlock; indexBlock > blockLimit; indexBlock = indexBlock - distanceBB) {
            const result = await doWorkfunc(exporter, api, indexBlock, chainName);
            // Display log every 100 blocks to show progress
            if (((startingBlock - indexBlock) % 100) == 0 && (startingBlock - indexBlock != 0)) {
                logger.info(`processed ${startingBlock - indexBlock}/${startingBlock - blockLimit} blocks for exporter ${exporterName} chain ${chainName}`)

            }
        }
    } catch (error) {
        logger.info(`loadHistoryFromApi error for chain ${chain}, ${error}}`)

    }
}

export async function loadHistory(exporter: any,
    defaultTimeOut: number,
    startingBlock: number,
    blockLimit: number,
    chain: string,
    exporterName: string,
    exporterVersion: number,
    chainName: string,
    distanceBB: number) {
    try {
        const provider = new WsProvider(chain, 1000, {}, defaultTimeOut);
        var api = await ApiPromise.create({ provider });
        await loadHistoryFromApi(exporter, exporter.doWork, api, startingBlock, blockLimit, chain, exporterName, distanceBB);

    } catch (error: any) {
        logger.info(`loadHistoryFromApi error error in connection for chain ${chain}, ${error}}`)
    }
}

export async function launchLoading(exporter: any) {
    if (parentPort != null) {
        parentPort.postMessage(
            await loadHistory(exporter, workerData.defaultTimeOut,
                workerData.startBlock,
                workerData.blockLimit,
                workerData.chain,
                workerData.exporterName,
                workerData.exporterVersion,
                workerData.chainName,
                workerData.distanceBB
            )
        )
    }
}