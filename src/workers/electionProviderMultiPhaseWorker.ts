import { ApiPromise } from "@polkadot/api";
import { config } from "dotenv";
import { decimals, sequelizeParams, offset } from '../utils'
import * as PromClient from "prom-client"
import { CTimeScaleExporter } from './CTimeScaleExporter';
import { ELECTION_MULT_PHASE_WORKER_PATH } from './workersPaths'
import { launchLoading } from './LoadHistory'
import { logger } from '../logger';
import { SignedBlock } from "@polkadot/types/interfaces";

config();
const connectionString = process.env.TSDB_CONN || "";
const Sequelize = require('sequelize');
const sequelize = (connectionString != "") ? new Sequelize(connectionString, { sequelizeParams, logging: false }) : null;

export class ElectionProviderMultiPhase extends CTimeScaleExporter {
    multiPhaseUnsignedSolutionSql: typeof Sequelize;
    multiPhaseSignedSolutionSql: typeof Sequelize;
    multiPhaseQueuedSolutionScoreSql: typeof Sequelize;
    multiPhaseSnapshotSql: typeof Sequelize;

    multiPhaseUnsignedSolutionMetric: any;
    multiPhaseSignedSolutionMetric: any;
    multiPhaseQueuedSolutionScoreMetric: any;
    multiPhaseSnapshotMetric: any;

    withProm: boolean;
    withTs: boolean;
    registry: PromClient.Registry;

    constructor(workerPath: string, registry: PromClient.Registry, withProm: boolean) {

        super(workerPath);
        this.registry = registry;
        this.withProm = withProm;
        this.withTs = (connectionString == "" ? false : true);

        if (this.withTs) {

            this.multiPhaseUnsignedSolutionSql = sequelize.define("runtime_multi_phase_election_unsigned", {
                time: { type: Sequelize.DATE, primaryKey: true },
                chain: { type: Sequelize.STRING, primaryKey: true },
                measure: { type: Sequelize.STRING, primaryKey: true },
                value: { type: Sequelize.INTEGER },
            }, { timestamps: false, freezeTableName: true });

            this.multiPhaseSignedSolutionSql = sequelize.define("runtime_multi_phase_election_signed", {
                time: { type: Sequelize.DATE, primaryKey: true },
                chain: { type: Sequelize.STRING, primaryKey: true },
                measure: { type: Sequelize.STRING, primaryKey: true },
                value: { type: Sequelize.INTEGER },
            }, { timestamps: false, freezeTableName: true });

            this.multiPhaseQueuedSolutionScoreSql = sequelize.define("runtime_multi_phase_election_score", {
                time: { type: Sequelize.DATE, primaryKey: true },
                chain: { type: Sequelize.STRING, primaryKey: true },
                score: { type: Sequelize.STRING, primaryKey: true },
                scorestake: { type: Sequelize.INTEGER },
            }, { timestamps: false, freezeTableName: true });

            this.multiPhaseSnapshotSql = sequelize.define("runtime_multi_phase_election_snapshot", {
                time: { type: Sequelize.DATE, primaryKey: true },
                chain: { type: Sequelize.STRING, primaryKey: true },
                size: { type: Sequelize.INTEGER },
            }, { timestamps: false, freezeTableName: true });

        }
        if (this.withProm) {
            // election-provider-multi-phase
            this.multiPhaseUnsignedSolutionMetric = new PromClient.Gauge({
                name: "runtime_multi_phase_election_unsigned",
                help: "Stats of the latest unsigned multi_phase submission.",
                labelNames: ["measure", "chain"]
            })

            this.multiPhaseSignedSolutionMetric = new PromClient.Gauge({
                name: "runtime_multi_phase_election_signed",
                help: "Stats of the latest signed multi_phase submission.",
                labelNames: ["measure", "chain"]
            })

            this.multiPhaseQueuedSolutionScoreMetric = new PromClient.Gauge({
                name: "runtime_multi_phase_election_score",
                help: "The score of any queued solution.",
                labelNames: ["score", "chain"]
            })

            this.multiPhaseSnapshotMetric = new PromClient.Gauge({
                name: "runtime_multi_phase_election_snapshot",
                help: "Size of the latest multi_phase election snapshot.",
                labelNames: ["chain"]

            })

            registry.registerMetric(this.multiPhaseUnsignedSolutionMetric);
            registry.registerMetric(this.multiPhaseSignedSolutionMetric);
            registry.registerMetric(this.multiPhaseQueuedSolutionScoreMetric);
            registry.registerMetric(this.multiPhaseSnapshotMetric);
        }
    }

    async writeUnsignedSolution(time: number, myChain: string, value: number, measure: string, withProm: boolean) {

        if (this.withTs) {
            const result = await this.multiPhaseUnsignedSolutionSql.create(
                {
                    time: time,
                    chain: myChain,
                    measure: measure,
                    value: value
                }, { fields: ['time', 'chain', 'measure', 'value'] },
                { tableName: 'runtime_multi_phase_election_unsigned' });
        }

        if (this.withProm) {
            this.multiPhaseUnsignedSolutionMetric.set({ measure: measure, chain: myChain }, value);

        }
    }

    async writeSignedSolution(time: number, myChain: string, value: number, measure: string, withProm: boolean) {


        if (this.withTs) {
            const result = await this.multiPhaseSignedSolutionSql.create(
                {
                    time: time,
                    chain: myChain,
                    measure: measure,
                    value: value
                }, { fields: ['time', 'chain', 'measure', 'value'] },
                { tableName: 'runtime_multi_phase_election_signed' });
        }

        if (this.withProm) {
            this.multiPhaseSignedSolutionMetric.set({ measure: measure, chain: myChain }, value);
        }
    }
    async writeQueuedSolution(time: number, myChain: string, scoreStake: number, score: string, withProm: boolean) {

        if (this.withTs) {
            const result = await this.multiPhaseQueuedSolutionScoreSql.create(
                {
                    time: time,
                    chain: myChain,
                    score: score,
                    scorestake: scoreStake
                }, { fields: ['time', 'chain', 'score', 'scorestake'] },
                { tableName: 'runtime_multi_phase_election_score' });
        }

        if (this.withProm) {
            this.multiPhaseQueuedSolutionScoreMetric.set({ score: score, chain: myChain }, scoreStake);
        }
    }
    async writeSnapshot(time: number, myChain: string, size: number, withProm: boolean) {


        if (this.withTs) {
            const result = await this.multiPhaseSnapshotSql.create(
                {
                    time: time,
                    chain: myChain,
                    size: size
                }, { fields: ['time', 'chain', 'size'] },
                { tableName: 'runtime_multi_phase_election_snapshot' });
        }

        if (this.withProm) {
            this.multiPhaseSnapshotMetric.set({ chain: myChain }, size);
        }
    }


    async clean(myChainName: string, startingBlockTime: Date, endingBlockTime: Date) {
        await super.cleanData(this.multiPhaseUnsignedSolutionSql, myChainName, startingBlockTime, endingBlockTime)
        await super.cleanData(this.multiPhaseSignedSolutionSql, myChainName, startingBlockTime, endingBlockTime)
        await super.cleanData(this.multiPhaseQueuedSolutionScoreSql, myChainName, startingBlockTime, endingBlockTime)
        await super.cleanData(this.multiPhaseSnapshotSql, myChainName, startingBlockTime, endingBlockTime)
    }

    async doWork(exporter: ElectionProviderMultiPhase, api: ApiPromise, indexBlock: number, chainName: string) {

        try {
            const blockHash = await api.rpc.chain.getBlockHash(indexBlock);

            const signed_block = await api.rpc.chain.getBlock(blockHash);

            const timestamp = (await api.query.timestamp.now.at(blockHash)).toNumber();
            const apiAt = await api.at(blockHash);

            for (let ext of signed_block.block.extrinsics) {

                if (ext.method.section.toLowerCase().includes("electionprovider") && ext.method.method === "submitUnsigned") {
                    let length = ext.encodedLength;
                    let weight = (await api.rpc.payment.queryInfo(ext.toHex())).weight.toNumber();
                    logger.debug(`detected submitUnsigned`);
                    await exporter.writeSignedSolution(timestamp, chainName.toString(), weight, 'weight', exporter.withProm);
                    await exporter.writeSignedSolution(timestamp, chainName.toString(), length, 'length', exporter.withProm);

                }

                if (ext.method.section.toLowerCase().includes("electionprovider") && ext.method.method === "submit") {
                    let length = ext.encodedLength;
                    let weight = (await api.rpc.payment.queryInfo(ext.toHex())).weight.toNumber()
                    logger.debug(`detected submit`);
                    await exporter.writeUnsignedSolution(timestamp, chainName.toString(), weight, 'weight', exporter.withProm);
                    await exporter.writeUnsignedSolution(timestamp, chainName.toString(), length, 'length', exporter.withProm);

                }
            }

            // If this is the block at which signed phase has started:
            let events = await apiAt.query.system.events();
            if (events.filter((ev) => ev.event.method.toString() == "SignedPhaseStarted").length > 0) {
                let key = apiAt.query.electionProviderMultiPhase.snapshot.key();
                let size = await api.rpc.state.getStorageSize(key);
                logger.debug(`detected SignedPhaseStarted, snap size: ${size.toHuman()}`)
                await exporter.writeSnapshot(timestamp, chainName.toString(), size.toNumber(), exporter.withProm);

            }

            if (events.filter((ev) => ev.event.method.toString() == "SolutionStored").length > 0) {
                let queued = await apiAt.query.electionProviderMultiPhase.queuedSolution();
                logger.debug(`detected SolutionStored: ${queued.unwrapOrDefault().toString()}`)
                await exporter.writeQueuedSolution(timestamp, chainName.toString(), queued.unwrapOrDefault().score.minimalStake.div(decimals(api)).toNumber(), 'x1', exporter.withProm);
                await exporter.writeQueuedSolution(timestamp, chainName.toString(), queued.unwrapOrDefault().score.sumStake.div(decimals(api)).toNumber(), 'x2', exporter.withProm);

            }

        } catch (error) {
            logger.debug(`doWork electionProviderMultiPhaseWorker error for chain ${chainName}, ${error}`);
        }
    }
}

async function run() {
    await launchLoading(exporter);
}

const registry = new PromClient.Registry();
let exporter = new ElectionProviderMultiPhase(ELECTION_MULT_PHASE_WORKER_PATH, registry, false);
run();
