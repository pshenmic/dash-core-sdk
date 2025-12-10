import { bytesToHex, hexToBytes } from '../utils'
import { BlockHeaderJSON } from '../types'
import x11 from '@dashevo/x11-hash-js'

export class BlockHeader {
  version: number
  previousBlockHash: string
  merkleRoot: string
  time: number
  nBits: number
  nonce: number

  constructor (version: number, previousBlockHash: string, merkleRoot: string, time: number, nBits: number, nonce: number) {
    this.version = version
    this.previousBlockHash = previousBlockHash
    this.merkleRoot = merkleRoot
    this.time = time
    this.nBits = nBits
    this.nonce = nonce
  }

  hash (): string {
    return bytesToHex(new Uint8Array(x11.digest([...this.bytes()], 1, 1).toReversed()))
  }

  bytes (): Uint8Array {
    const versionDataView = new DataView(new ArrayBuffer(4))
    const timeDataView = new DataView(new ArrayBuffer(4))
    const nBitsDataView = new DataView(new ArrayBuffer(4))
    const nonceDataView = new DataView(new ArrayBuffer(4))

    versionDataView.setUint32(0, this.version, true)
    timeDataView.setUint32(0, this.time, true)
    nBitsDataView.setUint32(0, this.nBits, true)
    nonceDataView.setUint32(0, this.nonce, true)

    const out = new Uint8Array(80)

    out.set(new Uint8Array(versionDataView.buffer), 0)
    out.set(hexToBytes(this.previousBlockHash).toReversed(), 4)
    out.set(hexToBytes(this.merkleRoot).toReversed(), 36)
    out.set(new Uint8Array(timeDataView.buffer), 68)
    out.set(new Uint8Array(nBitsDataView.buffer), 72)
    out.set(new Uint8Array(nonceDataView.buffer), 76)

    return out
  }

  hex (): string {
    return bytesToHex(this.bytes())
  }

  static fromBytes (bytes: Uint8Array): BlockHeader {
    const dataView = new DataView(bytes.buffer)

    const version = dataView.getUint32(0, true)

    const previousBlockHash = bytes.slice(4, 36)
    const merkleRoot = bytes.slice(36, 68)

    const time = dataView.getUint32(68, true)
    const nBits = dataView.getUint32(72, true)
    const nonce = dataView.getUint32(76, true)

    return new BlockHeader(version, bytesToHex(previousBlockHash.toReversed()), bytesToHex(merkleRoot.toReversed()), time, nBits, nonce)
  }

  static fromHex (hex: string): BlockHeader {
    return BlockHeader.fromBytes(hexToBytes(hex))
  }

  toJSON (): BlockHeaderJSON {
    return {
      version: this.version,
      previousBlockHash: this.previousBlockHash,
      merkleRoot: this.merkleRoot,
      time: this.time,
      nBits: this.nBits,
      nonce: this.nonce
    }
  }
}
