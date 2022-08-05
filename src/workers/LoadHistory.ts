import { parentPort, workerData } from 'worker_threads';
import { ApiPromise, WsProvider } from "@polkadot/api";

export async function loadHistoryFromApi(exporter: any, doWorkfunc: Function, api: ApiPromise, defaultTimeOut: number, startingBlock: number, blockLimit: number, chain: string) {
    try {
        const chainName = await (await api.rpc.system.chain()).toString();
        for (let indexBlock = startingBlock; indexBlock > blockLimit; indexBlock--) {
            const result = await doWorkfunc(exporter, api, indexBlock, chainName);
        }
    } catch (error) {
        console.log('loadHistoryFromApi error for chain', chain, error);
    }
}

export async function loadHistory(exporter: any,defaultTimeOut: number, startingBlock: number, blockLimit: number, chain: string) {
    try {
        const provider = new WsProvider(chain, 1000, {}, defaultTimeOut);
        var api = await ApiPromise.create({ provider });
        await loadHistoryFromApi(exporter,exporter.doWork, api, defaultTimeOut, startingBlock, blockLimit, chain);

    } catch (error: any) {
        console.log('error in connection', error);
    }
}

export async function launchLoading(exporter: any) {
    if (parentPort != null) {
        parentPort.postMessage(
            await loadHistory(exporter,workerData.defaultTimeOut,
                workerData.startBlock,
                workerData.blockLimit,
                workerData.chain
            )
        )
    }
}