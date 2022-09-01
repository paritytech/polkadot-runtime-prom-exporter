# Runtime Exporter Installation and Setup guide

## Prometheus exporter for polkadot runtime metrics

The Runtime Exporter collects in real time onchain current data, and historical data, in a form of data series, with the goal of visualising analytics, for any parachain of the Polkadot and Kusama ecosystems.

The Runtime Exporter Dashboards are Grafana based, and any user can customise and add his own metrics and dashboards.

The Runtime Exporter supports agnostically all parachains, and every pallet, when supported by the same parachain.

The Runtime Exporter data can be stored on prometheus, for the real time data only, and Timescaledb, for the real time data, and also for the historical data.
Both databases can be used simultaneously, or only one of them at a time.

The Runtime Exporter is Open Source, and any one can add its own metrics, while taking advantage of a shared deployment for data analytics visualisation.

## Installation

### Supported OS

The Runtime exporter is working on any version of Linux Debbian based system and MacOS.

### Pre-requesites

The Runtime Exporter uses two types of database, Prometheus and Timescalesdb. Timescaledb has the advantage of loading historical data and real time data, while Prometheus stores only real time data.

A minimum of one database is required, and it's up to you to install both Prometheus and Timescaledb.

**Yarn** is required for the installation.

#### Prometheus: 
https://prometheus.io/docs/prometheus/latest/installation/

Once Prometheus installed, go to the root of your runtime exporter folder and run this command :

```sh
../prometheus/prometheus-<your version>/prometheus --config.file="./prometheus.yml"
```

#### Timescaledb

https://docs.timescale.com/install/latest/self-hosted/installation-debian/

Once Timescaledb installed, run the following script to create the metric tables and configuration tables.

https://github.com/paritytech/polkadot-runtime-prom-exporter/src/sql/create_tables_timescale.sql

```sh
psql -U postgres -d <your database> -a -f sql/create_tables_timescale.sql
```

#### Grafana

Install Grafana

https://grafana.com/docs/grafana/latest/setup-grafana/installation/debian/

#### .env file

```sh
PORT=8000
TSDB_CONN='postgres://<postgres user>:<postgres password>@localhost:5432/tsdb'
CONFIG_FULL_PATH='<the full path of config.json>'
```

PORT is the prometheus connection port corresponding to your installation.

TSDB_CONN is the timescaledb connection string .

CONFIG_FULL_PATH is the full path of the config.json file.

If you are not using TimescaleDB, leave it empty.

#### config.json file

The config.json file contains a section named "rpcs" with the list of parachains you want to monitor, and you need to specify the rpc connection string for each of them.

For example:

```json
   "rpcs": [
        "wss://rpc.polkadot.io",
        "wss://kusama-rpc.polkadot.io"
    ],
```

Will monitor Polkadot and Kusama.

#### Install the Runtime Exporter

At this stage, you should be able to run the Runtime Exporter in a simple mode, meaning without loading history, which will be explained later.

Go to your Runtime Exporter root directory.

If you run the Runtime Exporter for the first time:

```sh
yarn
```

And then run the Runtime Exporter:

```sh
yarn run run
```

You should see the first lines of log:

```sh
yarn run v1.22.17
$ yarn run build && node build/index.js
$ ./node_modules/.bin/rimraf ./build && ./node_modules/.bin/tsc
[22-08-12 17:06:56] debug: Threads per exporter 2
[22-08-12 17:06:56] debug: Server listening on port 8000
```

If you run the Runtime Exporter with Prometheus, you can check your metrics right away:

http://localhost:9090/graph
or
http://localhost:9090/metrics

Congratulations, the Runtime Exporter is installed and running!

Howver, this is just the beginning, we will explain below how to configure the Runtime Exporter in order to load history for your chosen metrics and parachains.

#### Create a service for the Runtime Exporter

In order to guaranty that the Runtime Exporter is always up and running, it is recommended to define it as a service that will launch automatically in case of failure or disconnection.

Copy the following lines in a file named **exporter.bash** in < your script directory >

```sh
#!/bin/bash
date
date +"%FORMAT"
var=$(date)
var=`date`
echo "restart exporter at $var" >> /tmp/runtime-exporter.log

cd <your working directory>/polkadot-runtime-prom-exporter
sudo yarn run run
```

You can find running linux service under path:

```sh

cd /lib/systemd/system/
vi polkexporter.service
```

Paste and change **< your script directory >**:

```sh
[Unit]
Description=Runtime Exporter Metrics for Polkadot & Kusama
StartLimitIntervalSec=500
StartLimitBurst=5

[Service]
ExecStart=/<your working directory>/exporter.bash
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
```

## Load History

###

In order to load historical data for specific metrics and parachains, you need to configure the section **history** of the file **config.json** located at _< runtime exporter dir >/src_

Note that this file can be empty, and in this case, the Runtime Exporter will store the current ongoing data for every block, but not the history.

For example:

```json
    "history": [{
            "chain": "wss://rpc.polkadot.io",
            "startingBlock": 11512045,
            "endingBlock": 10512045,
            "pallets": "balances",
            "distanceBetweenBlocks": [{
                    "pallet": "balances",
                    "dist": 600
                },
                {
                    "pallet": "nominationPools",
                    "dist": 6000
                }]
        },
        {
            "chain": "wss://kusama-rpc.polkadot.io",
            "startingBlock": 13951344,
            "endingBlock": 13950344,
            "pallets": "system,nominationPools",
            "distanceBetweenBlocks": [{
                    "pallet": "nominationPools",
                    "dist": 6000
                }]
        }
    ]

```

We can see here 2 sections, each of them containing 5 parameters.

- **chain**: the same rpc connection string that you defined in the parachains.json for the corresponding parachain.
- **startingBlock**: the block to start loading history. Note that this number must be higher than the following endingBlock, as history is loaded backward.
- **endingBlock**: the block where history will stop loading.
- **pallets**: the list of pallets that you want to load. Every exporter that uses this pallet will be loaded. If the string is empty, then all the pallets are requested to load, meaning also all the existing exporters.
- **distanceBetweenBlocks**: the distance between blocks when querying historical data. You can define per pallet the distance bwtween blocks. If this section is not defined, the distance between blocks will use a default value of 1.

Please note that the last parameter of the config file, distanceBetweenBlocks , does not fit with all the exporters.
For example, the palletsMethodsCalls exporter counts the total number of calls per pallet and per method and per block. So in that case, if you define a distanceBetweenBlocks parameter, you will get the count only for the selected blocks, which represent only a portion of what it should be.

A good example of use could apply to the **balance**s exporter, as it is giving an instant snapshot of the total issuance amount. So whether it is collected for every block or for every 1000 blocks, the result will be the same. The effect of this parameter will be that the loading of historical record will be much faster than without.

You can modify this file as many times as you want, and restart the Runtime Exporter.
If the same configuration is used when restarting the Runtime Exporter, and history was successfully loaded in a previous run, the Runtime Exporter will ignore the record in order avoid to load again and again the same data.

## Versionning

This is an advanced section, you can skip it if you don't intend to write new exporters on your own.

The Runtime Exporter is an Open Source, and is subject to future additions and modifications.
Some exporters may require more metrics to be collected in the future, and when it happens, the versionning mechanism will allow to reload historical data only for Exporters where new metrics were added.

If you are a developer and add a new metric in a specific Exporter, you need to increase the version of the exporter by one.

For example, if you add a metric to the Balances Exporter (src/exporters/balances.ts), you have to change **this.exporterVersion** to 2 if it was 1.

```javascript
class BalancesExporter extends Balances implements Exporter {
    palletIdentifier: any;
    exporterVersion: number;
	exporterIdentifier: string;

    registry: PromClient.Registry;

    constructor(registry: PromClient.Registry) {
        //worker needs .js
        super(BALANCE_WORKER_PATH, registry, true);
        this.registry = registry;
        this.palletIdentifier = "balances";
        this.exporterIdentifier = "balances";
        this.exporterVersion = 2;

    }
```

### Checking that history has been loaded

When restarting, the Runtime Exporter, will detect which records that were previously loaded using the parachains_load_history.json file will have to be loaded again due to version changes.

Every time a historical record has finished loading, it writes a record into the table exporters_versions;

In order to verify that a record has been loaded from parachains_load_history.json, check the exporters_versions table and see if your record is registered:

```sql
select * from exporters_versions;

            time            | startingblock | endingblock |  chain   |          exporter          | version | distancebb
----------------------------+---------------+-------------+----------+----------------------------+---------+------------
 2022-08-12 21:18:35.55+02  |      11512045 |    11511045 | Polkadot | timestamp                  |       1 |          1
 2022-08-12 21:19:46.131+02 |      11512045 |    11511045 | Polkadot | palletMethodsCalls         |       1 |          1
 2022-08-12 21:20:11.697+02 |      11512045 |    11511045 | Polkadot | balances                   |       1 |          1
 2022-08-12 21:20:19.367+02 |      11512045 |    11511045 | Polkadot | xcmTransfers               |       1 |          1
 2022-08-12 21:20:42.498+02 |      11512045 |    11511045 | Polkadot | transactionPayment         |       1 |          1

```

You can alternatively query the tables that correspond to the metrics loaded by the requested pallets.

## Visualising data in Grafana

There are today around 40 different metrics, with 10 exporters.
Every metric can be visualized in Grafana, either using the Prometheus database as a data source, either timescaledb, or both of them.

There is a shared list of dashboard provided in this repository, that can be found at src/grafana-dashboards with many examples of database queries and charts.


## Adding Metrics and Exporters

The Runtime Exporter is an Open Source, and anyone can add its own metrics and exporters on top of it.
We're going to explain through examples how to add a new metric to an existing exporter, and how to add a new exporter.

This example will show you how to implement every method for the 2 supported databases (prometheus and timescaledb, but it's up to you to implement only one of the databases, if you do not intend to use the other when running the Runtime Exporter, having in mind that Prometheus would only work for runtime data collection.

### How to add a new metric to an existing exporter

In this example, we're going to add a new metric to the Balances Exporter, which is a simple exporter with one metric. 
In terms of code structure, every exporter is composed of 2 main files, in our case, **exporters/balances.ts** and **workers/balancesWorker.ts**.



Let's have a look at balances.ts

```javascript
import * as PromClient from "prom-client"
import { logger } from '../logger';
import { Exporter } from './IExporter';
import { ApiPromise } from "@polkadot/api";
import { Header } from "@polkadot/types/interfaces";
import { Balances } from '../workers/balancesWorker'
import { BALANCE_WORKER_PATH } from '../workers/workersPaths'

class BalancesExporter extends Balances implements Exporter {
    palletIdentifier: any;
    exporterVersion: number;
	exporterIdenfier: string;
    
    registry: PromClient.Registry;

    constructor(registry: PromClient.Registry) {
        //worker needs .js 
        super(BALANCE_WORKER_PATH, registry, true);
        this.registry = registry;
        this.palletIdentifier = "balances";
        this.exporterIdenfier = "balances";
        this.exporterVersion = 1;
        
    }

    async perBlock(api: ApiPromise, header: Header, chainName: string): Promise<void> {

        const blockNumber = parseInt(header.number.toString());
        const result = await this.doWork(this, api, blockNumber, chainName)

    }

    async perDay(api: ApiPromise, chainName: string) { }

    async perHour(api: ApiPromise, chainName: string) { }

    async init(chainName: string, startingBlockTime: Date, endingBlockTime: Date) { 
       
        await this.clean(  chainName.toString(), startingBlockTime, endingBlockTime);
    }

    async launchWorkers(threadsNumber: number, startingBlock: number, endingBlock: number, chain: string, chainName: string, distanceBB: number) {
        super.launchWorkers(threadsNumber, startingBlock, endingBlock, chain, this.exporterIdenfier, this.exporterVersion, chainName,distanceBB)
    }

}

export { BalancesExporter };
```

As we can see, there are 3 parameters:

**palletIdentifier**: the name of the pallet defined by Polkadot.

**exporterVersion**: the version of the exporter, which needs to be iterated by one every time a new metric is added, or when the exporter is modified.

**exporterIdenfier**: the name of the exporter.

Then, we can see 3 methods, **perBlock**, **perHour** and **perDay**.
This class allows you to choose at which frequency you are going to monitor your metric(s).
In our case we want to collect our new metric per block.The function doWork, that we are going to explain below is responsible for collecting the data, at the frequency of once per block.

Then we can see the **init** function, which is responsible to clean the data before loading a new historical record for the same metric, when requested by configuration.
And finally, the **launchWorkers** function, that calls the workers threads of the same exporter, when historical records are loaded.


At this stage, we modify the **exporterVersion** to 2, because we are going to add a new metric. 

Increasing the version for this exporter will have the effect of loading all the historical records that were previously loaded with this Exporter.

This is all the change that needs to be done in balances.ts.

Now let's review the **balancesWorker.ts** and see what we need to change here in order to add our new metric.

```javascript
import { ApiPromise } from "@polkadot/api";
import { config } from "dotenv";
import { decimals, sequelizeParams } from '../utils'
import * as PromClient from "prom-client"
import { CTimeScaleExporter } from './CTimeScaleExporter';
import { BALANCE_WORKER_PATH } from './workersPaths'
import { launchLoading } from './LoadHistory'

config();
const connectionString = process.env.TSDB_CONN || "";
const Sequelize = require('sequelize');
const sequelize = (connectionString != "") ? new Sequelize(connectionString, { sequelizeParams, logging: false }) : null;

export class Balances extends CTimeScaleExporter {
    balancesSql: typeof Sequelize;
    totalIssuanceMetric: any;
    withProm: boolean;
    withTs: boolean;
    registry: PromClient.Registry;
    exportersVersionsSql: typeof Sequelize;

    constructor(workerPath: string, registry: PromClient.Registry, withProm: boolean) {

        super(workerPath);
        this.registry = registry;
        this.withProm = withProm;
        this.withTs = (connectionString == "" ? false : true);

        if (this.withTs) {
            this.balancesSql = sequelize.define("runtime_total_issuance", {
                time: { type: Sequelize.DATE, primaryKey: true },
                chain: { type: Sequelize.STRING, primaryKey: true },
                issuance: { type: Sequelize.INTEGER },
            }, { timestamps: false, freezeTableName: true });
        }
        if (this.withProm) {
            this.totalIssuanceMetric = new PromClient.Gauge({
                name: "runtime_total_issuance",
                help: "the total issuance of the runtime, updated per block",
                labelNames: ["type", "chain"]
            })
            registry.registerMetric(this.totalIssuanceMetric);
        }
    }

    async write(time: number, myChain: string, issuance: number, withProm: boolean) {

        if (this.withTs) {
            const result = await this.balancesSql.create(
                {
                    time: time,
                    chain: myChain,
                    issuance: issuance
                }, { fields: ['time', 'chain', 'issuance'] },
                { tableName: 'runtime_total_issuance' });
        }

        if (this.withProm) {
            this.totalIssuanceMetric.set({ chain: myChain }, issuance);
        }
    }

    async doWork(exporter: Balances, api: ApiPromise, indexBlock: number, chainName: string) {

        const blockHash = await api.rpc.chain.getBlockHash(indexBlock);
        const apiAt = await api.at(blockHash);
        const timestamp = (await api.query.timestamp.now.at(blockHash)).toNumber();

        const issuance = (await apiAt.query.balances.totalIssuance()).toBn();
        const issuancesScaled = issuance.div(decimals(api)).toNumber();
        await exporter.write(timestamp, chainName.toString(), issuancesScaled, exporter.withProm);

    }

    async clean(myChainName: string, startingBlockTime: Date, endingBlockTime: Date) {
        await super.cleanData(this.balancesSql, myChainName, startingBlockTime, endingBlockTime)
    }
}

async function run() {
    await launchLoading(exporter);
}

const registry = new PromClient.Registry();
let exporter = new Balances(BALANCE_WORKER_PATH, registry, false);
run();

```

The Balances class is mainly responsible for storing the data, and is called by one of the functions perBlock, perHour and perDay, and also by the worker threads, when loading history.

Currently, the Runtime Exporter supports 2 databases, prometheus and Timescaledb.
Prometheus stores only runtime data, while Timescaledb stores both runtime data and historical data.
All the database interaction resides in 3 methods:

* The constructor where the data sctructures of the respective databases are defined. 
* The write function where data is written for all the databases, per metric.
* The clean function that deletes data of the same required segment by configuration, before loading data from new. This clean function applies only to historical records of course.

In order to keep the simple format of the Runtime Exporter, we recommend to write a new write_NEW_METRIC function for every single metric, and then use this write_NEW_METRIC function when implementing the code in the doWork function.

The doWork function is the place where we are adding our new metric code.
This function is called by the balanceExporter in runtime, and also by the **loadHistoryFromApi** function, located in LoadHistory.ts.

Let's say that we want to add a new metric in this exporter, that collects the balance of a specific address. Let's call it balanceUserA.

So all we have to do is:

- declare a new object of type Sequelize for timescaledb
- declare a new metric of prometheus

These 2 new variables will be placed just below the existing ones.

```javascript
export class Balances extends CTimeScaleExporter {
    balancesSql: typeof Sequelize;
    totalIssuanceMetric: any;

    balancesUserASql: typeof Sequelize;
    BalanceUserAMetric: any;

```

In the constructor, declare the data structure for the same objects:

```javascript
        if (this.withTs) {
            this.balancesSql = sequelize.define("runtime_total_issuance", {
                time: { type: Sequelize.DATE, primaryKey: true },
                chain: { type: Sequelize.STRING, primaryKey: true },
                issuance: { type: Sequelize.INTEGER },
            }, { timestamps: false, freezeTableName: true });

            this.balancesUserASql = sequelize.define("runtime_balance_user_a", {
                time: { type: Sequelize.DATE, primaryKey: true },
                chain: { type: Sequelize.STRING, primaryKey: true },
                balanceusera: { type: Sequelize.INTEGER },
            }, { timestamps: false, freezeTableName: true });
        }
        if (this.withProm) {
            this.totalIssuanceMetric = new PromClient.Gauge({
                name: "runtime_total_issuance",
                help: "the total issuance of the runtime, updated per block",
                labelNames: ["type", "chain"]
            })
            registry.registerMetric(this.totalIssuanceMetric);

            this.totalIssuanceMetric = new PromClient.Gauge({
                name: "runtime_balance_user_a",
                help: "the balance of a specific",
                labelNames: ["chain"]
            })
            registry.registerMetric(this.totalIssuanceMetric);
        }

```

Under the withTs section, we add the new Timescaledb data structure, and under withProm, we add the prometheus data structure plus the declaration of the registry.

Should we add a new database to the Runtime Exporter, the data sctructures and objects should be declared in this section.

Now we add a new write function that will take care of the storage of our metric, using the same principle, under the withThs section, add the timescaledb code, and under the withProm the prometheus related code.

```javascript
async writeBalanceA(time: number, myChain: string, balance: number, withProm: boolean) {

    if (this.withTs) {
        const resultA = await this.balancesUserASql.create(
            {
                time: time,
                chain: myChain,
                balance: balance
            }, { fields: ['time', 'chain', 'balance'] },
            { tableName: 'runtime_balance_a' });
    }

    if (this.withProm) {
        this.balancesUserASql.set({ chain: myChain }, balance);
    }
}
```

Add also the code for the clean function:

```javascript
  async clean(myChainName: string, startingBlockTime: Date, endingBlockTime: Date) {
        await super.cleanData(this.balancesSql, myChainName, startingBlockTime, endingBlockTime)
        await super.cleanData(this.balancesUserASql, myChainName, startingBlockTime, endingBlockTime)
    }
```

Now that we have our data objects properly declared and our write/clean functions, we can add our code at the end of the doWork function:

```javascript
async doWork(exporter: Balances, api: ApiPromise, indexBlock: number, chainName: string) {

        const blockHash = await api.rpc.chain.getBlockHash(indexBlock);
        const apiAt = await api.at(blockHash);
        const timestamp = (await api.query.timestamp.now.at(blockHash)).toNumber();

        const issuance = (await apiAt.query.balances.totalIssuance()).toBn();
        const issuancesScaled = issuance.div(decimals(api)).toNumber();
        await exporter.write(timestamp, chainName.toString(), issuancesScaled, exporter.withProm);

        const BALANCE_A_ADDRESS = 'GtGGqmjQeRt7Q5ggrjmSHsEEfeXUMvPuF8mLun2ApaiotVr';
        let balanceA = (await apiAt.query.system.account(BALANCE_A_ADDRESS));
        if (balanceA.data.free != null) {
            await exporter.writeBalanceA(timestamp, chainName.toString(), (balanceA.data.free.toBn().div(decimals(api))).toNumber(), exporter.withProm);
        } else {
            await exporter.writeBalanceA(timestamp, chainName.toString(), 0, exporter.withProm);
        }
    }
```

Please note that this code can read the state of the blockchain at a specific block, by using the **api.at** request.
As we remember that the doWork function is called both for the real time data, and also for the historical data.


That's it for the code.
We also want to create the table in the timescaledb database, which needs to be done externally with your preferred database tool:

```sql
CREATE TABLE IF NOT EXISTS runtime_balance_a (
  time TIMESTAMPTZ NOT NULL,
  chain TEXT NOT NULL,
  balance INTEGER NOT NULL
);
```

Congratulations, you've just added a new metric to an existing Exporter, you can now check on Grafana that the new metric collects data properly.

### How to add a new exporter

Now that we have seen how to add a new metric to an existing Exporter, we understand also that the same procedure can be repeated in the same exporter for additional metrics. 

But you might also want to create a new exporter of your own, so this is what we are going to explain below.

We saw before that an exporter consists of 2 files, for example:

- balances.ts
- balancesWorker.ts

In order to create a new exporter, we suggest to copy these 2 files in their respective directory, with a different name.
We'll call our new exporter **TheNew**.

So we have now:

- theNew.ts in exporters
- theNewWorker.ts in workers

In the import section, modify the names:

import { TheNew } from '../workers/theNewWorker.ts'
import { THE_NEW_WORKER_PATH } from '../workers/workersPaths'

Modify the existing BalanceExporter class name to TheNewExporter

Then, modify the constructor, with the palletIdentifier you will monitor in your exporter, and with the name of the new exporter. Also, set the THE_NEW_WORKER_PATH in the super call, that will initiate the worker's path:

```
   constructor(registry: PromClient.Registry) {
        //worker needs .js 
        super(THE_NEW_WORKER_PATH, registry, true);
        this.registry = registry;
        this.palletIdentifier = "balances";
        this.exporterIdenfier = "thenew";
        this.exporterVersion = 1;
        
    }

```

That's it for the theNew.ts file.

Now we add in the workersPaths.ts file the new THE_NEW_WORKER_PATH variable:


```
export const THE_NEW_WORKER_PATH = '/build/workers/theNewWorker.js';
```

This is because the nodejs Workers feature works only with .js extention, not the .ts.

And we add the new exporter in the index.ts located in src/exporters:

````
export * from '../exporters/system';
export * from '../exporters/balances';
export * from '../exporters/xcmTransfers';
export * from '../exporters/stakingMinerAccount';
export * from '../exporters/transactionPayment';
export * from '../exporters/staking';
export * from '../exporters/palletsMethodsCalls';
export * from '../exporters/electionProviderMultiPhase';
export * from '../exporters/timestamp';
export * from '../exporters/nominationPools';

export * from '../exporters/theNew';
````

We are almost at the end, we are going to make the changes in the theNewWorker.ts:

In the import section, change:

import { THE_NEW_WORKER_PATH } from './workersPaths'

In the code, we are replacing the name of the class with the new one, in 3 places:

````
export class TheNew extends CTimeScaleExporter {

````
````
async doWork(exporter: TheNew, api: ApiPromise, indexBlock: number, chainName: string) {

````
````
let exporter = new TheNew(THE_NEW_WORKER_PATH, registry, false);

````

That's it, we now just need to instanciate this new exporter before running it.

In the src/index.ts, add your new exporter in the import section:

```
import { SystemExporter, BalancesExporter, XCMTransfersExporter, StakingMinerAccountExporter, TransactionPaymentExporter, StakingExporter, PalletsMethodsExporter, ElectionProviderMultiPhaseExporter, TimestampExporter, NominationPoolsExporter, NewExporter } from "./exporters";
```

In the main function, we add the new exporter as well:

```javascript
			const exporters = [new SystemExporter(registry),
			new StakingExporter(registry),
			new BalancesExporter(registry),
			new TransactionPaymentExporter(registry),
			new StakingMinerAccountExporter(registry),
			new ElectionProviderMultiPhaseExporter(registry),
			new TimestampExporter(registry),
			new XCMTransfersExporter(registry),
			new PalletsMethodsExporter(registry),
			new NominationPoolsExporter(registry),
			new TheNewExporter(registry),
			]
```

That's all, you have now a new exporter, that at this stage, works exactly as the balance exporter, and it's now your turn to transform it for your needs, based on the explanations provided above, on how to add a new metric.

## Multi-threading

In order to increase performance when loading historical records, the Runtime Exporter runs in a multi-threaded environment. 
The principle of multi-threading in our case, is to let every thread loading a continuous portion of the required time segment for the same Exporter.
For example, if the startingBlock is 1000000 and the ending block is 900000(see config.json), and the number of threads is 5, then thread #1 will take charge of blocks 1000000-980000, thread 2, 980000-960000, etc...

When all the workers have finished, a new record in the exporters_versions table will be added, which will testify that a new historical record was added for this specific Exporter.
