/// Something that wants to be an exporter of data.
import { ApiPromise } from "@polkadot/api";
import { Header } from "@polkadot/types/interfaces";

export interface Exporter {
	/// The name of this pallet. If this property exists in `apu.query`, then we can assume this
	/// pallet exists in a runtime we connect to.
	///
	/// TODO: This is fundamentally flawed, since a pallet can be renamed inside the runtime. We need a
	/// better unique identifier for each pallet on the FRAME side.
	palletIdentifier: any;

	/// Hook executed per every block.
	///
	/// The header and block are also provided.
	perBlock(api: ApiPromise, header: Header, chainName: string): Promise<void>,
	/// Hook executed per every hour.
	perHour(api: ApiPromise, chainName: string): any,
	/// Hook executed per every day
	perDay(api: ApiPromise, chainName: string): any,
//	doLoadHistory(threadsNumber: number, startingBlock: number, endingBlock: number, chain: string): any
 	init(api: ApiPromise, chainName: string, startingBlockTime: Date, endingBlockTime: Date): any,
}

