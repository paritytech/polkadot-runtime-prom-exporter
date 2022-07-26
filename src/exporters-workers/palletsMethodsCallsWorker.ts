import { parentPort, workerData } from 'worker_threads';
import { ApiPromise, WsProvider } from "@polkadot/api";
import { config } from "dotenv";

config();

const connectionString = process.env.TSDB_CONN || "";

const Sequelize = require('sequelize')
const sequelize = (connectionString != "") ? new Sequelize(connectionString,
  {
    dialect: 'postgres',
    protocol: 'postgres',
  }) : null;

export async function writeToPalletsMethodsCalls(myTime: number, mySection: string, myMethod: string,
  myChain: string, myIsSigned: boolean, myCalls: number) {

  let palletsMethodsCalls = sequelize.define("pallets_methods_calls", {
    time: { type: Sequelize.DATE, primaryKey: true },
    section: { type: Sequelize.STRING, primaryKey: true },
    method: { type: Sequelize.STRING, primaryKey: true },
    chain: { type: Sequelize.STRING, primaryKey: true },
    is_signed: { type: Sequelize.BOOLEAN },
    calls: { type: Sequelize.INTEGER },
  }, { timestamps: false, freezeTableName: true }

  );
  const result = await palletsMethodsCalls.create(
    {
      time: myTime,
      section: mySection,
      method: myMethod,
      chain: myChain,
      is_signed: myIsSigned,
      calls: myCalls
    }, { fields: ['time', 'section', 'method', 'chain', 'is_signed', 'calls'] },
    { tableName: 'pallets_methods_calls' });

}

async function loadHistory(threadsNumber: number, defaultTimeOut: number, startingBlock: number, blockLimit: number, chain: string) {

  try {

    const provider = new WsProvider(chain, 1000, {}, defaultTimeOut);
    var api = await ApiPromise.create({ provider });

    const chainName = await (await api.rpc.system.chain()).toString();

    for (let indexBlock = startingBlock; indexBlock > blockLimit; indexBlock--) {

      const blockHash = await api.rpc.chain.getBlockHash(indexBlock);
      let timestamp = (await api.query.timestamp.now.at(blockHash)).toNumber();

      const signedBlock = await api.rpc.chain.getBlock(blockHash);
      let sectionMethods = new Map<string, [number, boolean, string]>();

      signedBlock.block.extrinsics.forEach((ex, index) => {

        const { isSigned, meta, method: { args, method, section } } = ex;
        let sectionMethod = section + '.' + method;
        const [count, issigned, mymethod]: [number, boolean, string] = sectionMethods.get(sectionMethod) || [0, isSigned, method];
        sectionMethods.set(sectionMethod, [count + 1, issigned, mymethod]);

      });

      for (let entry of sectionMethods.entries()) {
        const [count, sign, method]: [number, boolean, string] = entry[1] || [0, false, ''];
        let sectionName = (entry[0]).split('.');

        writeToPalletsMethodsCalls(timestamp, (entry[0]).split('.')[0], method, 'Polkadot', sign, count)

      }
    }

  } catch (error: any) {
    console.log('error in connection', error)
  }
}

async function launchLoading() {
  if (parentPort != null) {
    parentPort.postMessage(
      await loadHistory(workerData.threadNumbers, workerData.defaultTimeOut, workerData.startBlock, workerData.blockLimit, workerData.chain)
    )
  };
}

launchLoading();
