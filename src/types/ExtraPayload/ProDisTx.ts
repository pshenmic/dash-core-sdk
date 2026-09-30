import {
  bytesToHex,
  hexToBytes
} from '../../utils.js'
import { ProDisTxJSON } from '../../types.js'
import {COMPACT_SIGNATURE_SIZE} from "../../constants.js";

export class ProDisTx {
  version: number
  proTxHash: string
  actorIndex: number
  sigs: string[]

  constructor (version: number, proTxHash: string, actorIndex: number, sigs: string[]) {
    this.version = version
    this.proTxHash = proTxHash
    this.actorIndex = actorIndex
    this.sigs = sigs
  }

  static fromBytes (bytes: Uint8Array): ProDisTx {
    const dataView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

    const version = dataView.getUint16(0, true)

    const proTxHash = bytes.slice(2, 34)

    const actorIndex = dataView.getUint16(34, true)

    const sigCount = dataView.getUint8(36)

    const sigs: string[] = []

    for (let i = 0; i < sigCount; i++) {
      const offset = 37 + i * COMPACT_SIGNATURE_SIZE
      sigs.push(bytesToHex(bytes.slice(offset, offset + COMPACT_SIGNATURE_SIZE)))
    }

    return new ProDisTx(version, bytesToHex(proTxHash.toReversed()), actorIndex, sigs)
  }

  static fromHex (hex: string): ProDisTx {
    return ProDisTx.fromBytes(hexToBytes(hex))
  }

  bytes (): Uint8Array {
    const versionBytes = new Uint8Array(2)
    const actorIndexBytes = new Uint8Array(2)

    new DataView(versionBytes.buffer, versionBytes.byteOffset, versionBytes.byteLength).setUint16(0, this.version, true)
    new DataView(actorIndexBytes.buffer, actorIndexBytes.byteOffset, actorIndexBytes.byteLength).setUint16(0, this.actorIndex, true)

    const proTxHashBytes = new Uint8Array(32)
    proTxHashBytes.set(hexToBytes(this.proTxHash).toReversed())

    const outBytes = new Uint8Array(37 + this.sigs.length * COMPACT_SIGNATURE_SIZE)

    outBytes.set(versionBytes, 0)
    outBytes.set(proTxHashBytes, 2)
    outBytes.set(actorIndexBytes, 34)
    outBytes.set([this.sigs.length], 36)

    this.sigs.forEach((sig, i) => {
      outBytes.set(hexToBytes(sig), 37 + i * COMPACT_SIGNATURE_SIZE)
    })

    return outBytes
  }

  hex (): string {
    return bytesToHex(this.bytes())
  }

  toJSON (): ProDisTxJSON {
    return {
      actorIndex: this.actorIndex,
      proTxHash: this.proTxHash,
      sigs: this.sigs,
      version: this.version
    }
  }
}
