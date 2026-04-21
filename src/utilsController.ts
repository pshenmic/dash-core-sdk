import {Transaction} from "./types/Transaction.js";
import {InstantLock} from "./types/InstantLock.js";
import {TransactionType} from "./constants.js";
import {AssetLockTx} from "./types/ExtraPayload/AssetLockTx.js";

export interface InstantAssetLockProofParams {
  type: 'instantLock'
  transaction: string
  outputIndex: number
  instantLock: string
}

export interface ChainAssetLockProofParams {
  type: 'chainLock'
  txid: string
  outputIndex: number
  coreChainLockedHeight: number
}

export interface InstantAssetLockProofData {
  transaction: Transaction,
  instantLock: InstantLock,
  outputIndex: number
}

export interface ChainAssetLockProofData {
  transaction: Transaction,
  coreChainLockedHeight: number,
  outputIndex: number
}

export class UtilsController {
  constructor() {}

  createAssetLockProof (data: InstantAssetLockProofData | ChainAssetLockProofData): InstantAssetLockProofParams | ChainAssetLockProofParams {
    const txid = data.transaction.hash()

    if (data.transaction.type !== TransactionType.TRANSACTION_ASSET_LOCK || !(data.transaction.extraPayload instanceof AssetLockTx)) {
      throw new Error('Asset lock proof requires an asset lock transaction')
    }

    if (data.outputIndex >= data.transaction.extraPayload.outputs.length) {
      throw new Error(`outputIndex must be lower than the number of asset lock credit outputs (${data.transaction.extraPayload.outputs.length})`)
    }

    if("instantLock" in data && !("coreChainLockedHeight" in data)) {
      // instant lock
      if (data.instantLock.txId !== txid) {
        throw new Error(`InstantLock txid ${data.instantLock.txId} does not match transaction txid ${txid}`)
      }

      return {
        type: 'instantLock',
        instantLock: data.instantLock.hex(),
        transaction: data.transaction.hex(),
        outputIndex: data.outputIndex,
      }
    } else if("coreChainLockedHeight" in data && !("instantLock" in data)) {
      // chain lock
      if (data.coreChainLockedHeight < 0) {
        throw new Error('coreChainLockedHeight must be a non-negative integer')
      }

      return {
        type: 'chainLock',
        txid,
        outputIndex: data.outputIndex,
        coreChainLockedHeight: data.coreChainLockedHeight
      }
    } else {
      throw new Error("Invalid lock params");
    }
  }
}