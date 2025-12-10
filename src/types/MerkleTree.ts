import { bytesToHex, decodeCompactSize, doubleSHA256, getCompactVariableSize, hexToBytes } from '../utils'
import { MAX_BLOCK_WEIGHT, MIN_TRANSACTION_WEIGHT } from '../constants'
import { MerkleTreeJSON } from '../types'

export class MerkleTree {
  transactionCount: number
  hashes: string[]
  flags: boolean[]

  constructor (transactionCount: number, hashes: string[], flags: boolean[]) {
    this.transactionCount = transactionCount
    this.hashes = hashes
    this.flags = flags
  }

  calcTreeWidth (height: number): number {
    return (this.transactionCount + (1 << height) - 1) >> height
  }

  calcHash (height: number, pos: number, txIds: string[]): string {
    if (height === 0) {
      return txIds[pos]
    } else {
      const left: string = this.calcHash(height - 1, pos * 2, txIds)

      let right: string

      if (pos * 2 + 1 < this.calcTreeWidth(height - 1)) {
        right = this.calcHash(height - 1, pos * 2 + 1, txIds)
      } else {
        right = left
      }

      return this.parentHash(left, right)
    }
  }

  parentHash (left: string, right: string): string {
    const leftBytes = hexToBytes(left)
    const rightBytes = hexToBytes(right)

    const union = new Uint8Array(leftBytes.byteLength + rightBytes.byteLength)
    union.set(leftBytes, 0)
    union.set(rightBytes, leftBytes.byteLength)

    return bytesToHex(doubleSHA256(union))
  }

  extractMatches (matches: string[], indexes: number[]): string {
    matches.length = 0
    indexes.length = 0

    if (this.transactionCount === 0) {
      throw new Error('Merkle Tree does not contain transactions')
    }

    if (this.transactionCount > MAX_BLOCK_WEIGHT / MIN_TRANSACTION_WEIGHT) {
      throw new Error('Too many transactions in Merkle Tree')
    }

    if (this.hashes.length > this.transactionCount) {
      throw new Error('Too many hashes in Merkle Tree')
    }

    if (this.flags.length < this.hashes.length) {
      throw new Error('Not enough flags in Merkle Tree')
    }

    let height = 0

    while (this.calcTreeWidth(height) > 1) {
      height++
    }

    const state = { bitsUsed: 0, hashUsed: 0 }

    return this.traverseAndExtract(height, 0, matches, indexes, state)
  }

  traverseAndExtract (height: number, pos: number, matches: string[], indexes: number[], state: { bitsUsed: number, hashUsed: number }): string {
    if (state.bitsUsed >= this.flags.length) {
      throw new Error('MerkleTree: traverseAndExtract(): flags overflow')
    }

    const parentFlag = this.flags[state.bitsUsed]
    state.bitsUsed += 1

    if (height === 0 || !parentFlag) {
      if (state.hashUsed >= this.hashes.length) {
        throw new Error('MerkleTree: traverseAndExtract(): hashes overflow')
      }

      const hash = this.hashes[state.hashUsed]
      state.hashUsed += 1

      if (height === 0 && parentFlag) {
        matches.push(hash)
        indexes.push(pos)
      }

      return hash
    } else {
      const left: string = this.traverseAndExtract(height - 1, pos * 2, matches, indexes, state)

      let right: string

      if (pos * 2 + 1 < this.calcTreeWidth(height - 1)) {
        right = this.traverseAndExtract(
          height - 1,
          pos * 2 + 1,
          matches,
          indexes,
          state
        )

        if (right === left) {
          throw new Error('MerkleTree: traverseAndExtract(): IdenticalHashesFound')
        }
      } else {
        right = left
      }
      return this.parentHash(left, right)
    }
  }

  static fromBytes (bytes: Uint8Array): MerkleTree {
    const dataView = new DataView(bytes.buffer)

    const transactionCount = dataView.getUint32(0, true)
    const hashCount = decodeCompactSize(4, bytes)

    const hashes: string[] = []
    let hashOffset = 4 + getCompactVariableSize(hashCount)

    for (let i = 0; i < hashCount; i++) {
      const hash = bytesToHex(bytes.slice(hashOffset, hashOffset + 32))
      hashes.push(hash)

      hashOffset += 32
    }

    const flagByteCount = decodeCompactSize(hashOffset, bytes)

    const flagsBytes = bytes.slice(hashOffset + getCompactVariableSize(flagByteCount), hashOffset + getCompactVariableSize(flagByteCount) + Number(flagByteCount))

    const flags: boolean[] = []
    for (let i = 0; i < flagsBytes.length; i++) {
      const byte = flagsBytes[i]
      for (let bit = 0; bit < 8; bit++) {
        flags.push((byte & (1 << bit)) !== 0)
      }
    }

    return new MerkleTree(Number(transactionCount), hashes, flags)
  }

  static fromHex (hex: string): MerkleTree {
    return MerkleTree.fromBytes(hexToBytes(hex))
  }

  toJSON (): MerkleTreeJSON {
    return {
      transactionCount: this.transactionCount,
      hashes: this.hashes,
      flags: this.flags
    }
  }
}
