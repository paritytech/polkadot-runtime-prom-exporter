import { parentPort, workerData } from 'worker_threads';
import { ApiPromise, WsProvider } from "@polkadot/api";
import { sequelizeParams } from '../utils'
import { CTimeScaleExporter } from './CTimeScaleExporter';
import * as PromClient from "prom-client"
import { PALLETSMETHODS_WORKER_PATH } from './workersPaths'
import { launchLoading } from './LoadHistory'

const connectionString = process.env.TSDB_CONN || "";
const Sequelize = require('sequelize');
const sequelize = (connectionString != "") ? new Sequelize(connectionString, { sequelizeParams, logging: false }) : null;

export class PalletMethods extends CTimeScaleExporter {

    palletsMethodsCallsSql: typeof Sequelize;
    methodsCallsMetric: any;
    withProm: boolean;

    registry: PromClient.Registry;

    constructor(workerPath: string, registry: PromClient.Registry, withProm: boolean) {

        super(workerPath);
        this.registry = registry;
        this.withProm = withProm;

        this.palletsMethodsCallsSql = sequelize.define("pallets_methods_calls", {
            time: { type: Sequelize.DATE, primaryKey: true },
            section: { type: Sequelize.STRING, primaryKey: true },
            method: { type: Sequelize.STRING, primaryKey: true },
            chain: { type: Sequelize.STRING, primaryKey: true },
            is_signed: { type: Sequelize.BOOLEAN },
            calls: { type: Sequelize.INTEGER },
        }, { timestamps: false, freezeTableName: true }

        );

        if (this.withProm) {

            this.methodsCallsMetric = new PromClient.Gauge({
                name: "runtime_section_method_calls_per_block",
                help: "number of methods calls per block provided with section",
                labelNames: ["chain", "section", "method", "type"]
            })

            registry.registerMetric(this.methodsCallsMetric);
        }
    }

    async write(myTime: number, mySection: string, myMethod: string,
        myChain: string, myIsSigned: boolean, myCalls: number, withProm: boolean) {

        const result = await this.palletsMethodsCallsSql.create(
            {
                time: myTime,
                section: mySection,
                method: myMethod,
                chain: myChain,
                is_signed: myIsSigned,
                calls: myCalls
            }, { fields: ['time', 'section', 'method', 'chain', 'is_signed', 'calls'] },
            { tableName: 'pallets_methods_calls' });

        if (this.withProm) {
            this.methodsCallsMetric.set({ section: mySection, type: myIsSigned, method: myMethod, chain: myChain }, myCalls);
        }
    }

    async doWork(exporter: PalletMethods, api: ApiPromise, indexBlock: number, chainName: string) {

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
            exporter.write(timestamp, (entry[0]).split('.')[0], method, chainName, sign, count, exporter.withProm);
        }
    }
}


async function run() {
    await launchLoading(exporter);
}

const registry = new PromClient.Registry();
let exporter = new PalletMethods(PALLETSMETHODS_WORKER_PATH, registry, false);
run();
