import { Script } from './Script.js'
import {
  bytesToHex,
  decodeCompactSize,
  encodeCompactSize,
  getCompactVariableSize,
  hexToBytes
} from '../utils.js'
import { InputJSON } from '../types.js'

export class Input {
  txId: string
  vOut: number
  scriptSig: Script
  sequence: number

  constructor (txId: string | Uint8Array, vOut: number, scriptSig: Script, sequence: number) {
    if (typeof txId === 'string') {
      this.txId = txId
    } else if (ArrayBuffer.isView(txId)) {
      this.txId = bytesToHex(txId)
    } else {
      this.txId = bytesToHex(new Uint8Array(32))
    }

    this.vOut = vOut
    this.scriptSig = scriptSig
    this.sequence = sequence
  }

  getTxIdHex (): string {
    return this.txId
  }

  bytes (): Uint8Array {
    const txIdBytes = hexToBytes(this.txId)
    const vOutBytes = new DataView(new ArrayBuffer(4))
    const scriptSigBytes = this.scriptSig.bytes()
    const scriptSigSizeBytes = encodeCompactSize(scriptSigBytes.byteLength)
    const sequenceBytes = new DataView(new ArrayBuffer(4))

    vOutBytes.setUint32(0, this.vOut, true)
    sequenceBytes.setUint32(0, this.sequence, true)

    const bytes = new Uint8Array(txIdBytes.byteLength + vOutBytes.byteLength + scriptSigBytes.byteLength + scriptSigSizeBytes.byteLength + sequenceBytes.byteLength)

    bytes.set(txIdBytes.toReversed(), 0)
    bytes.set(new Uint8Array(vOutBytes.buffer), txIdBytes.byteLength)
    bytes.set(scriptSigSizeBytes, txIdBytes.byteLength + vOutBytes.byteLength)
    bytes.set(scriptSigBytes, txIdBytes.byteLength + vOutBytes.byteLength + scriptSigSizeBytes.byteLength)
    bytes.set(new Uint8Array(sequenceBytes.buffer), txIdBytes.byteLength + vOutBytes.byteLength + scriptSigBytes.byteLength + scriptSigSizeBytes.byteLength)

    return bytes
  }

  static fromBytes (bytes: Uint8Array): Input {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

    const txIdBytes = bytes.slice(0, 32)
    const vOut = view.getUint32(32, true)

    const scriptSigSize = decodeCompactSize(36, bytes)
    const scriptBytesSize = getCompactVariableSize(scriptSigSize)

    const scriptStart = 36 + scriptBytesSize
    const scriptEnd = scriptStart + Number(scriptSigSize)

    const scriptSigBytes = bytes.slice(scriptStart, scriptEnd)

    const sequence = view.getUint32(scriptEnd, true)

    return new Input(
      txIdBytes.toReversed(),
      vOut,
      Script.fromBytes(scriptSigBytes),
      sequence
    )
  }

  hex (): string {
    return bytesToHex(this.bytes())
  }

  static fromHex (hex: string): Input {
    return Input.fromBytes(hexToBytes(hex))
  }

  toJSON (): InputJSON {
    return {
      txId: this.txId,
      vOut: this.vOut,
      scriptSig: this.scriptSig.ASMString(),
      sequence: this.sequence
    }
  }
}
