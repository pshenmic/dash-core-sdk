import {BlockJSON} from '../types.js'
import {BlockHeader} from "./BlockHeader.js";
import {Transaction} from "./Transaction.js";

export class Block {
  blockHeader: BlockHeader
  txCount: number
  txs: Transaction[]

  constructor (blockHeader: BlockHeader, txCount: number, txs: Transaction[]) {
    this.blockHeader = blockHeader
    this.txCount = txCount
    this.txs = txs
  }

  hash (): string {
  }

  bytes (): Uint8Array {
  }

  hex (): string {
  }

  static fromBytes (bytes: Uint8Array): Block {
  }

  static fromHex (hex: string): Block {
  }

  toJSON (): BlockJSON {
    return {
      blockHeader: this.blockHeader.toJSON(),
      txCount: this.txCount,
      txs: this.txs.map(tx => tx.toJSON()),
    }
  }
}
