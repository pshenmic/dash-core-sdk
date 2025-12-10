import { Script } from './Script'
import {
  bytesToHex,
  decodeCompactSize,
  encodeCompactSize,
  getCompactVariableSize,
  hexToBytes
} from '../utils'
import { InputJSON } from '../types'

export class Input {
  txId: Uint8Array
  vOut: number
  scriptSig: Script
  sequence: number

  constructor (txId: string | Uint8Array, vOut: number, scriptSig: Script, sequence: number) {
    if (typeof txId === 'string') {
      this.txId = hexToBytes(txId)
    } else if (ArrayBuffer.isView(txId)) {
      this.txId = txId
    } else {
      this.txId = new Uint8Array(32)
    }

    this.vOut = vOut
    this.scriptSig = scriptSig
    this.sequence = sequence
  }

  getTxIdHex (): string {
    return bytesToHex(this.txId.toReversed())
  }

  bytes (): Uint8Array {
    const txIdBytes = this.txId
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
    const txIdBytes = bytes.slice(0, 32)

    const vOutBytes = new DataView(bytes.slice(32, 36).buffer)

    const scriptSigSize = decodeCompactSize(36, bytes)
    const scriptBytesSize = getCompactVariableSize(scriptSigSize)

    const scriptSigBytes = bytes.slice(36 + scriptBytesSize, 36 + scriptBytesSize + Number(scriptSigSize))

    const sequenceBytes = new DataView(bytes.slice(36 + scriptBytesSize + Number(scriptSigSize), 36 + scriptBytesSize + Number(scriptSigSize) + 4).buffer)

    return new Input(
      txIdBytes.toReversed(),
      vOutBytes.getUint32(0, true),
      Script.fromBytes(scriptSigBytes),
      sequenceBytes.getUint32(0, true)
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
      txId: bytesToHex(this.txId),
      vOut: this.vOut,
      scriptSig: this.scriptSig.ASMString(),
      sequence: this.sequence
    }
  }
}
