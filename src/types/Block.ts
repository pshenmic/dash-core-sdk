import { BlockJSON } from '../types.js'
import { BlockHeader } from './BlockHeader.js'
import { Transaction } from './Transaction.js'
import { bytesToHex, decodeCompactSize, encodeCompactSize, getCompactVariableSize, hexToBytes } from '../utils.js'

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
    return this.blockHeader.hash()
  }

  bytes (): Uint8Array {
    const headerBytes = this.blockHeader.bytes()
    const txCountBytes = encodeCompactSize(this.txs.length)
    const txBytes = this.txs.map(tx => tx.bytes())
    const txSize = txBytes.reduce((acc, curr) => acc + curr.byteLength, 0)

    const out = new Uint8Array(headerBytes.length + txCountBytes.length + txSize)
    let offset = 0

    out.set(headerBytes, offset)
    offset += headerBytes.length

    out.set(txCountBytes, offset)
    offset += txCountBytes.length

    for (const tx of txBytes) {
      out.set(tx, offset)
      offset += tx.byteLength
    }

    return out
  }

  hex (): string {
    return bytesToHex(this.bytes())
  }

  static fromBytes (bytes: Uint8Array): Block {
    const blockHeader = BlockHeader.fromBytes(bytes.slice(0, 80))

    const txCount = decodeCompactSize(80, bytes)
    const txCountSize = getCompactVariableSize(txCount)

    const txs: Transaction[] = []
    let txOffset = 80 + txCountSize

    for (let i = BigInt(0); i < txCount; i++) {
      const tx = Transaction.fromBytes(bytes.slice(txOffset))
      txs.push(tx)
      txOffset += tx.bytes().byteLength
    }

    return new Block(blockHeader, Number(txCount), txs)
  }

  static fromHex (hex: string): Block {
    return Block.fromBytes(hexToBytes(hex))
  }

  toJSON (): BlockJSON {
    return {
      blockHeader: this.blockHeader.toJSON(),
      txCount: this.txCount,
      txs: this.txs.map(tx => tx.toJSON()),
    }
  }
}
