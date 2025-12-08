import { bytesToHex, hexToBytes } from '../utils'
import { BlockHeaderJSON } from '../types'

export class BlockHeader {
  version: number
  previousBlockHash: Uint8Array
  merkleRoot: Uint8Array
  time: number
  nBits: number
  nonce: number

  constructor (version: number, previousBlockHash: Uint8Array, merkleRoot: Uint8Array, time: number, nBits: number, nonce: number) {
    this.version = version
    this.previousBlockHash = previousBlockHash
    this.merkleRoot = merkleRoot
    this.time = time
    this.nBits = nBits
    this.nonce = nonce
  }

  static fromBytes (bytes: Uint8Array): BlockHeader {
    const dataView = new DataView(bytes.buffer)

    const version = dataView.getUint32(0, true)

    const previousBlockHash = bytes.slice(4, 36)
    const merkleRoot = bytes.slice(36, 68)

    const time = dataView.getUint32(68, true)
    const nBits = dataView.getUint32(72, true)
    const nonce = dataView.getUint32(76, true)

    return new BlockHeader(version, previousBlockHash.toReversed(), merkleRoot.toReversed(), time, nBits, nonce)
  }

  static fromHex (hex: string): BlockHeader {
    return BlockHeader.fromBytes(hexToBytes(hex))
  }

  toJSON (): BlockHeaderJSON {
    return {
      version: this.version,
      previousBlockHash: bytesToHex(this.previousBlockHash),
      merkleRoot: bytesToHex(this.merkleRoot),
      time: this.time,
      nBits: this.nBits,
      nonce: this.nonce
    }
  }
}
