import { bytesToHex, hexToBytes } from '../utils.js'
import { OutPointJSON } from '../types.js'

export class OutPoint {
  txId: Uint8Array
  vOut: number

  constructor (txId: Uint8Array, vOut: number) {
    this.txId = txId
    this.vOut = vOut
  }

  bytes (): Uint8Array {
    const out = new Uint8Array(36)
    const vOutView = new DataView(new ArrayBuffer(4))
    vOutView.setUint32(0, this.vOut, true)

    out.set(this.txId.toReversed(), 0)
    out.set(new Uint8Array(vOutView.buffer), this.txId.length)

    return out
  }

  hex (): string {
    return bytesToHex(this.bytes())
  }

  static fromBytes (bytes: Uint8Array): OutPoint {
    const dataView = new DataView(bytes.buffer)

    const txId = bytes.slice(0, 32)
    const vOut = dataView.getUint32(32, true)

    return new OutPoint(txId.toReversed(), vOut)
  }

  static fromHex (hex: string): OutPoint {
    return OutPoint.fromBytes(hexToBytes(hex))
  }

  toJSON (): OutPointJSON {
    return {
      txId: bytesToHex(this.txId),
      vOut: this.vOut
    }
  }
}
