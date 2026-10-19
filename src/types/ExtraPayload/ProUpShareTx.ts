import { Script } from '../Script.js'
import {
  bytesToHex,
  decodeCompactSize,
  encodeCompactSize,
  getCompactVariableSize,
  hexToBytes
} from '../../utils.js'
import { NetworkLike, ProUpShareTxJSON } from '../../types.js'
import { DEFAULT_NETWORK } from '../../constants.js'

export class ProUpShareTx {
  version: number
  proTxHash: string
  shareIndex: number

  scriptReward: Script
  inputsHash: string

  payloadSig: string

  constructor (version: number, proTxHash: string, shareIndex: number, scriptReward: Script, inputsHash: string, payloadSig: string) {
    this.version = version
    this.proTxHash = proTxHash
    this.shareIndex = shareIndex

    this.scriptReward = scriptReward
    this.inputsHash = inputsHash

    this.payloadSig = payloadSig
  }

  getRewardAddress (network: NetworkLike = DEFAULT_NETWORK): string | undefined {
    return this.scriptReward.getAddress(network)
  }

  static fromBytes (bytes: Uint8Array): ProUpShareTx {
    const dataView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

    const version = dataView.getUint16(0, true)

    const proTxHash = bytes.slice(2, 34)

    const shareIndex = dataView.getUint16(34, true)

    const scriptRewardSize = decodeCompactSize(36, bytes)
    const scriptRewardOffset = 36 + getCompactVariableSize(scriptRewardSize)
    const scriptReward = Script.fromBytes(bytes.slice(scriptRewardOffset, scriptRewardOffset + Number(scriptRewardSize)))

    const inputsHashOffset = scriptRewardOffset + Number(scriptRewardSize)
    const inputsHash = bytes.slice(inputsHashOffset, inputsHashOffset + 32)

    const payloadSigSize = decodeCompactSize(inputsHashOffset + 32, bytes)
    const payloadSigOffset = inputsHashOffset + 32 + getCompactVariableSize(payloadSigSize)
    const payloadSig = bytes.slice(payloadSigOffset, payloadSigOffset + Number(payloadSigSize))

    return new ProUpShareTx(version, bytesToHex(proTxHash.toReversed()), shareIndex, scriptReward, bytesToHex(inputsHash.toReversed()), bytesToHex(payloadSig))
  }

  static fromHex (hex: string): ProUpShareTx {
    return ProUpShareTx.fromBytes(hexToBytes(hex))
  }

  bytes (): Uint8Array {
    const versionBytes = new Uint8Array(2)
    const shareIndexBytes = new Uint8Array(2)

    new DataView(versionBytes.buffer, versionBytes.byteOffset, versionBytes.byteLength).setUint16(0, this.version, true)
    new DataView(shareIndexBytes.buffer, shareIndexBytes.byteOffset, shareIndexBytes.byteLength).setUint16(0, this.shareIndex, true)

    const proTxHashBytes = new Uint8Array(32)
    proTxHashBytes.set(hexToBytes(this.proTxHash).toReversed())

    const scriptRewardBytes = this.scriptReward.bytes()
    const scriptRewardSizeBytes = encodeCompactSize(scriptRewardBytes.byteLength)

    const inputsHashBytes = new Uint8Array(32)
    inputsHashBytes.set(hexToBytes(this.inputsHash).toReversed())

    const payloadSigBytes = hexToBytes(this.payloadSig)
    const payloadSigSizeBytes = encodeCompactSize(payloadSigBytes.byteLength)

    const outBytes = new Uint8Array(68 + scriptRewardSizeBytes.byteLength + scriptRewardBytes.byteLength + payloadSigSizeBytes.byteLength + payloadSigBytes.byteLength)

    outBytes.set(versionBytes, 0)
    outBytes.set(proTxHashBytes, 2)
    outBytes.set(shareIndexBytes, 34)
    outBytes.set(scriptRewardSizeBytes, 36)
    outBytes.set(scriptRewardBytes, 36 + scriptRewardSizeBytes.byteLength)
    outBytes.set(inputsHashBytes, 36 + scriptRewardSizeBytes.byteLength + scriptRewardBytes.byteLength)
    outBytes.set(payloadSigSizeBytes, 68 + scriptRewardSizeBytes.byteLength + scriptRewardBytes.byteLength)
    outBytes.set(payloadSigBytes, 68 + scriptRewardSizeBytes.byteLength + scriptRewardBytes.byteLength + payloadSigSizeBytes.byteLength)

    return outBytes
  }

  hex (): string {
    return bytesToHex(this.bytes())
  }

  toJSON (): ProUpShareTxJSON {
    return {
      inputsHash: this.inputsHash,
      payloadSig: this.payloadSig,
      proTxHash: this.proTxHash,
      scriptReward: this.scriptReward.ASMString(),
      shareIndex: this.shareIndex,
      version: this.version
    }
  }
}
