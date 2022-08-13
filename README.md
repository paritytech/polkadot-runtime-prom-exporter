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

#### Promtheus: 
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
```
PORT is the prometheus connection port corresponding to your installation.

TSDB_CONN is the timescaledb connection string 

If you are not using TimescaleDB, leave it empty.

#### parachains.json file

The parachains.json file contains the list of parachains you want to monitor, and you need to specify the rpc connection string for each of them.

For example:

```json
[
    "wss://rpc.polkadot.io",
    "wss://kusama-rpc.polkadot.io"
]
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

In order to load historical data for specific metrics and parachains, you need to configure the file **parachains_load_history.json** located at *< runtime exporter dir >/src*

Note that this file can be empty, and in this case, the Runtime Exporter will store the current ongoing data for every block, but not the history.


For example:

```sh
[{
            "chain": "wss://rpc.polkadot.io",
            "startingBlock": 11512045,
            "endingBlock": 11511045,
            "pallets": ""
        },
        {
            "chain": "wss://kusama-rpc.polkadot.io",
            "startingBlock": 13951344,
            "endingBlock": 13950344,
            "pallets": "system,nominationPools"
        }
]

```

We can see here 2 sections, each of them containing 4 parameters.

* **chain**: the same rpc connection string that you defined in the parachains.json for the corresponding parachain.
* **startingBlock**: the block to start loading history. Note that this number must be higher than the following endingBlock, as history is loaded backward.
* **endingBlock**: the block where history will stop loading.
* **pallets**: the list of pallets that you want to load. Every exporter that uses this pallet will be loaded. If the string is empty, then all the pallets are requested to load, meaning also all the existing exporters.

You can modify this file as many times as you want, and restart the Runtime Exporter. 
If the same configuration is used when restarting the Runtime Exporter, and history was successfully loaded in a previous run, the Runtime Exporter will ignore the record in order avoid to load again and again the same data.

## Versionning

This is an advanced section, you can skip it if you don't intend to write new exporters on your own.

The Runtime Exporter is an Open Source, and is subject to future additions and modifications.
Some exporters may require more metrics to be collected in the future, and when it happens, the versionning mechanism will allow to reload historical data only for Exporters where new  metrics were added. 

If you are a developer and add a new metric in a specific Exporter, you need to increase the version of the exporter by one.



For example, if you add a metric to the Balances Exporter (src/exporters/balances.ts), you have to change **this.exporterVersion** to 2 if it was 1.

```code
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
        this.exporterVersion = 2;
        
    }
```

### Checking that history has been loaded 

When restarting, the Runtime Exporter, will detect which records that were previously loaded using the parachains_load_history.json file will have to be loaded again due to version changes.

Every time a historical record has finished loading, it writes a record into the table exporters_versions;

In order to verify that a record has been loaded from parachains_load_history.json, check the exporters_versions table and see if your record is registered:

```sql
select * from exporters_versions;

            time            | startingblock | endingblock |  chain   |          exporter          | version 
----------------------------+---------------+-------------+----------+----------------------------+---------
 2022-08-12 21:18:35.55+02  |      11512045 |    11511045 | Polkadot | timestamp                  |       1
 2022-08-12 21:19:46.131+02 |      11512045 |    11511045 | Polkadot | palletMethodsCalls         |       1
 2022-08-12 21:20:11.697+02 |      11512045 |    11511045 | Polkadot | balances                   |       1

```

You can alternatively query the tables that correspond to the metrics loaded by the requested pallets.

## Visualising data in Grafana

There are today around 40 different metrics, with 10 exporters.
Every metric can be visualized in Grafana, either using the Prometheus database as a data source, either timescaledb, or both of them. 

There is a shared list of dashboard provided in this repository, that can be found at src/grafana-dashboards with many examples of database queries and charts.
