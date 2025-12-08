import { bytesToHex, decodeCompactSize, encodeCompactSize, getCompactVariableSize, hexToBytes } from '../utils'
import { OutPoint } from './OutPoint'
import { InstantLockJSON } from '../types'

export class InstantLock {
  version: number
  inputs: OutPoint[]
  txId: Uint8Array
  cycleHash: Uint8Array
  signature: Uint8Array

  constructor (version: number, inputs: OutPoint[], txId: Uint8Array, cycleHash: Uint8Array, signature: Uint8Array) {
    this.version = version
    this.inputs = inputs
    this.txId = txId
    this.cycleHash = cycleHash
    this.signature = signature
  }

  bytes (): Uint8Array {
    const inputSizeBytes = encodeCompactSize(this.inputs.length)

    const inputsBytes = this.inputs.reduce((acc, curr) => {
      const out = new Uint8Array(acc.byteLength + 36)

      out.set(acc, 0)
      out.set(curr.bytes(), acc.byteLength)

      return out
    }, new Uint8Array(0))

    const out = new Uint8Array(1 + inputSizeBytes.byteLength + inputsBytes.byteLength + this.txId.length + this.cycleHash.byteLength + this.signature.byteLength)

    out.set(new Uint8Array([this.version]), 0)
    out.set(inputSizeBytes, 1)
    out.set(inputsBytes, 1 + inputSizeBytes.byteLength)
    out.set(this.txId, 1 + inputSizeBytes.byteLength + inputsBytes.byteLength)
    out.set(this.cycleHash, 1 + inputSizeBytes.byteLength + inputsBytes.byteLength + this.txId.byteLength)
    out.set(this.signature, 1 + inputSizeBytes.byteLength + inputsBytes.byteLength + this.txId.byteLength + this.cycleHash.byteLength)

    return out
  }

  hex (): string {
    return bytesToHex(this.bytes())
  }

  static fromBytes (bytes: Uint8Array): InstantLock {
    const [version] = bytes

    const inputSize = decodeCompactSize(1, bytes)
    const inputsBytes = bytes.slice(1 + getCompactVariableSize(inputSize), 1 + getCompactVariableSize(inputSize) + Number(inputSize) * 36)

    const txIdOffset = 1 + getCompactVariableSize(inputSize) + Number(inputSize) * 36

    const txId = bytes.slice(txIdOffset, txIdOffset + 32)

    const cycleHash = bytes.slice(txIdOffset + 32, txIdOffset + 32 + 32)

    const sig = bytes.slice(txIdOffset + 32 + 32, txIdOffset + 32 + 32 + 96)

    const inputs: OutPoint[] = []

    for (let i = 0; i < inputSize; i++) {
      inputs.push(OutPoint.fromBytes(inputsBytes.slice(i * 36, (i + 1) * 36)))
    }

    return new InstantLock(version, inputs, txId, cycleHash, sig)
  }

  static fromHex (hex: string): InstantLock {
    return InstantLock.fromBytes(hexToBytes(hex))
  }

  toJSON (): InstantLockJSON {
    const inputsJSON = this.inputs.map(input => input.toJSON())

    return {
      version: this.version,
      inputs: inputsJSON,
      txId: bytesToHex(this.txId.toReversed()),
      cycleHash: bytesToHex(this.cycleHash.toReversed()),
      signature: bytesToHex(this.signature)
    }
  }
}
