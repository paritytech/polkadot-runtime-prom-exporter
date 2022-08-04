import { ApiPromise } from "@polkadot/api";
import { config } from "dotenv";
import {  sequelizeParams } from '../utils'
import * as PromClient from "prom-client"
import { CTimeScaleExporter } from './CTimeScaleExporter';
import { XCM_TRANSFERS_WORKER_PATH } from './workersPaths'
import { launchLoading } from './LoadHistory'

config();
const connectionString = process.env.TSDB_CONN || "";
const Sequelize = require('sequelize');
const sequelize = (connectionString != "") ? new Sequelize(connectionString, { sequelizeParams, logging: false }) : null;

export class System extends CTimeScaleExporter {
    systemFinalizedSql: typeof Sequelize;
    systemWeightSql: typeof Sequelize;
    systemBLockLenghtSql: typeof Sequelize;

    finalizedHead: any;
    blockWeight: any;
    blockLength: any;

    withProm: boolean;
    registry: PromClient.Registry;

    constructor(workerPath: string, registry: PromClient.Registry, withProm: boolean) {

        super(workerPath);
        this.registry = registry;
        this.withProm = withProm;

        this.systemFinalizedSql = sequelize.define("chain_finalized_number", {
            time: { type: Sequelize.DATE, primaryKey: true },
            chain: { type: Sequelize.STRING, primaryKey: true },
            finalizednumber: { type: Sequelize.INTEGER },
        }, { timestamps: false, freezeTableName: true });

        this.systemWeightSql = sequelize.define("runtime_weight", {
            time: { type: Sequelize.DATE, primaryKey: true },
            chain: { type: Sequelize.STRING, primaryKey: true },
            weightclass: { type: Sequelize.STRING },
            weight: { type: Sequelize.BIGINT },
        }, { timestamps: false, freezeTableName: true });

        this.systemBLockLenghtSql = sequelize.define("runtime_block_length_bytes", {
            time: { type: Sequelize.DATE, primaryKey: true },
            chain: { type: Sequelize.STRING, primaryKey: true },
            blocklength: { type: Sequelize.INTEGER },
        }, { timestamps: false, freezeTableName: true });


        if (this.withProm) {
            this.finalizedHead = new PromClient.Gauge({
                name: "chain_finalized_number",
                help: "finalized head of the chain.",
                labelNames: ["class", "chain"]
            })
            this.blockWeight = new PromClient.Gauge({
                name: "runtime_weight",
                help: "weight of the block; labeled by dispatch class.",
                labelNames: ["class", "chain"]
            })
            this.blockLength = new PromClient.Gauge({
                name: "runtime_block_length_bytes",
                help: "encoded length of the block in bytes.",
                labelNames: ["class", "chain"]
            })

            registry.registerMetric(this.finalizedHead);
            registry.registerMetric(this.blockWeight);
            registry.registerMetric(this.blockLength);

        }
    }

    async writeFinalizedNumber(time: number, myChain: string, finalizedNumber: number, withProm: boolean) {

        const result = await this.systemFinalizedSql.create(
            {
                time: time,
                chain: myChain,
                finalizednumber: finalizedNumber
            }, { fields: ['time', 'chain', 'finalizednumber'] },
            { tableName: 'chain_finalized_number' });

        if (this.withProm) {
            this.finalizedHead.set({ chain: myChain }, finalizedNumber);
        }
    }

    async writeWeight(time: number, myChain: string, weight: number, weightClass: string, withProm: boolean) {

        const result = await this.systemWeightSql.create(
            {
                time: time,
                chain: myChain,
                weightclass: weightClass,
                weight: weight
            }, { fields: ['time', 'chain', 'weightclass', 'weight'] },
            { tableName: 'runtime_weight' });

        if (this.withProm) {
            this.blockWeight.set({ chain: myChain }, weight);
        }
    }

    async writeBlockLengthBytes(time: number, myChain: string, blockLength: number, withProm: boolean) {

        const result = await this.systemBLockLenghtSql.create(
            {
                time: time,
                chain: myChain,
                blocklength: blockLength
            }, { fields: ['time', 'chain', 'blocklength'] },
            { tableName: 'runtime_block_length_bytes' });

        if (this.withProm) {
            this.blockLength.set({ chain: myChain }, blockLength);
        }
    }

    async doWork(exporter: System, api: ApiPromise, indexBlock: number, chainName: string) {

        const blockHash = await api.rpc.chain.getBlockHash(indexBlock);
        const apiAt = await api.at(blockHash);
        let timestamp = (await api.query.timestamp.now.at(blockHash)).toNumber();

        exporter.writeFinalizedNumber(timestamp, chainName.toString(), indexBlock, exporter.withProm);

        const weight = await apiAt.query.system.blockWeight();
        exporter.writeWeight(timestamp, chainName.toString(), weight.normal.toNumber(), "normal", exporter.withProm);
        exporter.writeWeight(timestamp, chainName.toString(), weight.operational.toNumber(), "operational", exporter.withProm);
        exporter.writeWeight(timestamp, chainName.toString(), weight.mandatory.toNumber(), "mandatory", exporter.withProm);

        const block = await api.rpc.chain.getBlock(blockHash);

        exporter.writeBlockLengthBytes(timestamp, chainName.toString(), block.block.encodedLength, exporter.withProm);
      
    }
}

async function run() {
    await launchLoading(exporter);
}

const registry = new PromClient.Registry();
let exporter = new System(XCM_TRANSFERS_WORKER_PATH, registry, false);
run();