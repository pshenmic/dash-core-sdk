import { bytesToHex, hexToBytes } from '../../utils.js'
import { AssetUnlockTxJSON } from '../../types.js'

export class AssetUnlockTx {
  version: number
  index: bigint
  fee: number
  requestedHeight: number
  quorumHash: string
  quorumSig: string

  constructor (version: number, index: bigint, fee: number, requestedHeight: number, quorumHash: string, quorumSig: string) {
    this.version = version
    this.index = index
    this.fee = fee
    this.requestedHeight = requestedHeight
    this.quorumHash = quorumHash
    this.quorumSig = quorumSig
  }

  static fromBytes (bytes: Uint8Array): AssetUnlockTx {
    const dataView = new DataView(bytes.buffer)

    const version = dataView.getUint8(0)
    const index = dataView.getBigUint64(1, true)
    const fee = dataView.getUint32(9, true)
    const requestedHeight = dataView.getUint32(13, true)

    const quorumHash = bytes.slice(17, 49)
    const quorumSig = bytes.slice(49)

    return new AssetUnlockTx(version, index, fee, requestedHeight, bytesToHex(quorumHash.toReversed()), bytesToHex(quorumSig))
  }

  static fromHex (hex: string): AssetUnlockTx {
    return AssetUnlockTx.fromBytes(hexToBytes(hex))
  }

  bytes (): Uint8Array {
    const versionByte = new Uint8Array(1)
    const indexBytes = new Uint8Array(8)
    const feeBytes = new Uint8Array(4)
    const requestedHeightBytes = new Uint8Array(4)

    new DataView(versionByte.buffer).setUint8(0, this.version)
    new DataView(indexBytes.buffer).setBigUint64(0, this.index, true)
    new DataView(feeBytes.buffer).setUint32(0, this.fee, true)
    new DataView(requestedHeightBytes.buffer).setUint32(0, this.requestedHeight, true)

    const quorumHashBytes = hexToBytes(this.quorumHash).toReversed()
    const quorumSigBytes = hexToBytes(this.quorumSig)

    const out = new Uint8Array(145)

    out.set(versionByte, 0)
    out.set(indexBytes, 1)
    out.set(feeBytes, 9)
    out.set(requestedHeightBytes, 13)
    out.set(quorumHashBytes, 17)
    out.set(quorumSigBytes, 49)

    return out
  }

  hex (): string {
    return bytesToHex(this.bytes())
  }

  toJSON (): AssetUnlockTxJSON {
    return {
      version: this.version,
      index: this.index.toString(),
      fee: this.fee,
      requestedHeight: this.requestedHeight,
      quorumHash: this.quorumHash,
      quorumSig: this.quorumSig
    }
  }
}
