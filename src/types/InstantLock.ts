import { bytesToHex, decodeCompactSize, encodeCompactSize, getCompactVariableSize, hexToBytes } from '../utils.js'
import { OutPoint } from './OutPoint.js'
import { InstantLockJSON } from '../types.js'

export class InstantLock {
  version: number
  inputs: OutPoint[]
  txId: string
  cycleHash: string
  signature: string

  constructor (version: number, inputs: OutPoint[], txId: string, cycleHash: string, signature: string) {
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

    const txIdBytes = hexToBytes(this.txId).toReversed()
    const cycleHashBytes = hexToBytes(this.cycleHash).toReversed()
    const signatureBytes = hexToBytes(this.signature)

    const out = new Uint8Array(1 + inputSizeBytes.byteLength + inputsBytes.byteLength + txIdBytes.byteLength + cycleHashBytes.byteLength + signatureBytes.byteLength)

    out.set(new Uint8Array([this.version]), 0)
    out.set(inputSizeBytes, 1)
    out.set(inputsBytes, 1 + inputSizeBytes.byteLength)
    out.set(txIdBytes, 1 + inputSizeBytes.byteLength + inputsBytes.byteLength)
    out.set(cycleHashBytes, 1 + inputSizeBytes.byteLength + inputsBytes.byteLength + txIdBytes.byteLength)
    out.set(signatureBytes, 1 + inputSizeBytes.byteLength + inputsBytes.byteLength + txIdBytes.byteLength + cycleHashBytes.byteLength)

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

    return new InstantLock(version, inputs, bytesToHex(txId.toReversed()), bytesToHex(cycleHash.toReversed()), bytesToHex(sig))
  }

  static fromHex (hex: string): InstantLock {
    return InstantLock.fromBytes(hexToBytes(hex))
  }

  toJSON (): InstantLockJSON {
    const inputsJSON = this.inputs.map(input => input.toJSON())

    return {
      version: this.version,
      inputs: inputsJSON,
      txId: this.txId,
      cycleHash: this.cycleHash,
      signature: this.signature
    }
  }
}
