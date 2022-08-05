import * as PromClient from "prom-client"
import { getFinalizedApi } from '../utils';
import { decimals } from '../utils';
import { logger } from '../logger';
import { Exporter } from './IExporter';
import { ApiPromise } from "@polkadot/api";
import { Header } from "@polkadot/types/interfaces";
import BN from "bn.js";
import { ApiDecoration } from "@polkadot/api/types";
import { AccountId, Balance, } from "@polkadot/types/interfaces/runtime"
import { PalletBagsListListNode } from "@polkadot/types/lookup"
import { Staking } from '../workers/stakingWorker'
import { STAKING_WORKER_PATH } from '../workers/workersPaths'

class StakingExporter extends Staking implements Exporter {
    palletIdentifier: any;
    registry: PromClient.Registry;

    stakeMetric: PromClient.Gauge<"type" | "chain">;
    ledgerMetric: PromClient.Gauge<"type" | "chain">;
    voterListBags: PromClient.Gauge<"type" | "chain">;
    voterListNodesPerBag: PromClient.Gauge<"bag" | "chain">;
    voterListNodes: PromClient.Gauge<"type" | "chain">;

    constructor(registry: PromClient.Registry) {
        super(STAKING_WORKER_PATH, registry, true);
        this.registry = registry;
        this.palletIdentifier = "staking";

        this.stakeMetric = new PromClient.Gauge({
            name: "runtime_stake",
            help: "Total amount of staked tokens",
            labelNames: ["type", "chain"]
        })

        this.ledgerMetric = new PromClient.Gauge({
            name: "runtime_staking_ledger",
            help: "the entire staking ledger data",
            labelNames: ["type", "chain"]
        })

        // bags-list pallet.
        this.voterListBags = new PromClient.Gauge({
            name: "runtime_voter_list_bags",
            help: "number of voter list bags",
            labelNames: ["type"] // active or empty
        })

        this.voterListNodesPerBag = new PromClient.Gauge({
            name: "runtime_voter_list_node_per_bag",
            help: "number of nodes per bag",
            labelNames: ["bag"],

        })

        this.voterListNodes = new PromClient.Gauge({
            name: "runtime_voter_list_nodes",
            help: "number of nodes in the voter list",
            labelNames: ["type"] // node or needs-rebag
        })

        registry.registerMetric(this.stakeMetric);
        registry.registerMetric(this.ledgerMetric);
        registry.registerMetric(this.voterListBags);
        registry.registerMetric(this.voterListNodesPerBag);
        registry.registerMetric(this.voterListNodes);

    }

    async init(api: ApiPromise, chainName: string, startingBlockTime: Date, endingBlockTime: Date) {

        await this.clean(api, chainName.toString(), startingBlockTime, endingBlockTime);

    }

    async perBlock(api: ApiPromise, header: Header, chainName: string): Promise<void> {

        const blockNumber = parseInt(header.number.toString());
        const result = await this.doWork(this, api, blockNumber, chainName);

    }

    async perDay(api: ApiPromise, chainName: string) {
        logger.info(`starting daily scrape at ${new Date().toISOString()}`)
        let ledgers = await api.query.staking.ledger.entries();

        let totalBondedAccounts = ledgers.length;
        let totalBondedStake = ledgers.map(([_, ledger]) =>
            ledger.unwrapOrDefault().total.toBn().div(decimals(api)).toNumber()
        ).reduce((prev, next) => prev + next)
        let totalUnbondingChunks = ledgers.map(([_, ledger]) => {
            if (ledger.unwrapOrDefault().unlocking.length) {
                return ledger.unwrapOrDefault().unlocking.map((unlocking) =>
                    unlocking.value.toBn().div(decimals(api)).toNumber()
                ).reduce((prev, next) => prev + next)
            } else {
                return 0
            }
        }
        ).reduce((prev, next) => prev + next)

        this.ledgerMetric.set({ type: "bonded_accounts", chain: chainName }, totalBondedAccounts)
        this.ledgerMetric.set({ type: "bonded_stake", chain: chainName }, totalBondedStake)
        this.ledgerMetric.set({ type: "unbonding_stake", chain: chainName }, totalUnbondingChunks)

    }

    async perHour(api: ApiPromise, chainName: string) {
        logger.info(`starting hourly scrape at ${new Date().toISOString()}`)

        let stakingPromise = this.stakingHourly(api, chainName);
        let voterBagsPromise = this.voterBags(api, chainName);
        Promise.all([stakingPromise, voterBagsPromise])

    }

    async launchWorkers(threadsNumber: number, startingBlock: number, endingBlock: number, chain: string) {
        super.launchWorkers(threadsNumber, startingBlock, endingBlock, chain);

    }


    async stakingHourly(baseApi: ApiPromise, chainName: string) {
        const api = await getFinalizedApi(baseApi);
        let currentEra = (await api.query.staking.currentEra()).unwrapOrDefault();
        let exposures = await api.query.staking.erasStakers.entries(currentEra);

        let totalSelfStake = exposures.map(([_, expo]) => expo.own.toBn().div(decimals(api)).toNumber()).reduce((prev, next) => prev + next);
        let totalOtherStake = exposures.map(([_, expo]) => (expo.total.toBn().sub(expo.own.toBn())).div(decimals(api)).toNumber()).reduce((prev, next) => prev + next);
        let totalStake = totalOtherStake + totalSelfStake;

        this.stakeMetric.set({ type: "self", chain: chainName }, totalSelfStake);
        this.stakeMetric.set({ type: "other", chain: chainName }, totalOtherStake);
        this.stakeMetric.set({ type: "all", chain: chainName }, totalStake);

        let totalExposedNominators = exposures.map(([_, expo]) => expo.others.length).reduce((prev, next) => prev + next);
        let totalExposedValidators = exposures.length;

        this.validatorCountMetric.set({ type: "active", chain: chainName }, totalExposedValidators);
        this.nominatorCountMetric.set({ type: "active", chain: chainName }, totalExposedNominators);
    }

    async voterBags(baseApi: ApiPromise, chainName: string) {
        const api = await getFinalizedApi(baseApi);

        interface Bag {
            head: AccountId,
            tail: AccountId,
            upper: Balance,
            nodes: AccountId[],
        }

        async function needsRebag(
            api: ApiDecoration<"promise">,
            bagThresholds: BN[],
            node: PalletBagsListListNode,
        ): Promise<boolean> {
            const currentWeight = await correctWeightOf(node, api);
            const canonicalUpper = bagThresholds.find((t) => t.gt(currentWeight)) || new BN("18446744073709551615");
            if (canonicalUpper.gt(node.bagUpper)) {
                return true
            } else if (canonicalUpper.lt(node.bagUpper)) {
                // this should ALMOST never happen: we handle all rebags to lower accounts, except if a
                // slash happens.
                return true
            } else {
                // correct spot.
                return false
            }
        }

        async function correctWeightOf(node: PalletBagsListListNode, api: ApiDecoration<"promise">): Promise<BN> {
            const currentAccount = node.id;
            const currentCtrl = (await api.query.staking.bonded(currentAccount)).unwrap();
            return (await api.query.staking.ledger(currentCtrl)).unwrapOrDefault().active.toBn()
        }

        if (api.query['bagsList']) {

            let entries = await api.query.bagsList.listBags.entries();

            const bags: Bag[] = [];
            const needRebag: AccountId[] = [];
            const bagThresholds = api.consts.bagsList.bagThresholds.map((x) => baseApi.createType('Balance', x));

            entries.forEach(([key, bag]) => {
                if (bag.isSome && bag.unwrap().head.isSome && bag.unwrap().tail.isSome) {
                    const head = bag.unwrap().head.unwrap();
                    const tail = bag.unwrap().tail.unwrap();
                    const keyInner = key.args[0];
                    const upper = baseApi.createType('Balance', keyInner.toBn());
                    bags.push({ head, tail, upper, nodes: [] })
                }
            });

            //      console.log(`🧾 collected a total of ${bags.length} active bags.`)
            bags.sort((a, b) => a.upper.cmp(b.upper));

            let counter = 0;
            for (const { head, tail, upper, nodes } of bags) {
                // process the bag.
                let current = head;
                let cond = true
                while (cond) {
                    const currentNode = (await api.query.bagsList.listNodes(current)).unwrap();
                    if (await needsRebag(api, bagThresholds, currentNode)) {
                        needRebag.push(currentNode.id);
                    }
                    nodes.push(currentNode.id);
                    if (currentNode.next.isSome) {
                        current = currentNode.next.unwrap()
                    } else {
                        cond = false
                    }
                }
                counter += nodes.length;
                this.voterListNodesPerBag.set({ "bag": upper.toString(), chain: chainName }, nodes.length)
                //         console.log(`👜 Bag ${upper.toHuman()} - ${nodes.length} nodes: [${head} .. -> ${head !== tail ? tail : ''}]`)
            }

            this.voterListBags.set({ type: "active", chain: chainName }, bags.length)
            this.voterListBags.set({ type: "empty", chain: chainName }, bagThresholds.length);

            this.voterListNodes.set({ type: "all_nodes", chain: chainName }, counter);
            this.voterListNodes.set({ type: "needs_rebag", chain: chainName }, needsRebag.length);

            //     console.log(`📊 total count of nodes: ${counter}`);
            //     console.log(`..of which ${needRebag.length} need a rebag`);
        }
    }
}

export { StakingExporter };
