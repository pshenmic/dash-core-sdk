import { Script } from '../Script.js'
import {
  bytesToHex,
  decodeCompactSize,
  encodeCompactSize,
  getCompactVariableSize,
  hexToBytes,
  publicKeyHashToAddress
} from '../../utils.js'
import { NetworkLike, ProUpRegTxJSON } from '../../types.js'
import { DEFAULT_NETWORK } from '../../constants.js'

export class ProUpRegTx {
  version: number
  proTxHash: string
  mode: number

  keyIdVoting: string
  pubKeyOperator: string

  scriptPayout: Script
  inputsHash: string

  payloadSig: string

  constructor (version: number, proTxHash: string, mode: number, pubKeyOperator: string, keyIdVoting: string, scriptPayout: Script, inputsHash: string, payloadSig: string) {
    this.version = version
    this.proTxHash = proTxHash
    this.mode = mode

    this.pubKeyOperator = pubKeyOperator
    this.keyIdVoting = keyIdVoting

    this.scriptPayout = scriptPayout
    this.inputsHash = inputsHash

    this.payloadSig = payloadSig
  }

  getVotingAddress (network: NetworkLike = DEFAULT_NETWORK): string {
    return publicKeyHashToAddress(hexToBytes(this.keyIdVoting), network)
  }

  getPayoutAddress (network: NetworkLike = DEFAULT_NETWORK): string | undefined {
    return this.scriptPayout.getAddress(network)
  }

  static fromBytes (bytes: Uint8Array): ProUpRegTx {
    const dataView = new DataView(bytes.buffer)

    const version = dataView.getUint16(0, true)

    const proTxHash = bytes.slice(2, 34)

    const mode = dataView.getUint16(34, true)

    const pubKeyOperator = bytes.slice(36, 84)
    const keyIdVoting = bytes.slice(84, 104)

    const scriptPayoutSize = decodeCompactSize(104, bytes)
    const scriptPayout = Script.fromBytes(bytes.slice(104 + getCompactVariableSize(scriptPayoutSize), 104 + getCompactVariableSize(scriptPayoutSize) + Number(scriptPayoutSize)))

    const inputsHashOffset = 104 + getCompactVariableSize(scriptPayoutSize) + Number(scriptPayoutSize)
    const inputsHash = bytes.slice(inputsHashOffset, inputsHashOffset + 32)

    const payloadSigSize = decodeCompactSize(inputsHashOffset + 32, bytes)
    const payloadSig = bytes.slice(inputsHashOffset + 32 + getCompactVariableSize(payloadSigSize), inputsHashOffset + 32 + getCompactVariableSize(payloadSigSize) + Number(payloadSigSize))

    return new ProUpRegTx(version, bytesToHex(proTxHash.toReversed()), mode, bytesToHex(pubKeyOperator), bytesToHex(keyIdVoting), scriptPayout, bytesToHex(inputsHash.toReversed()), bytesToHex(payloadSig))
  }

  static fromHex (hex: string): ProUpRegTx {
    return ProUpRegTx.fromBytes(hexToBytes(hex))
  }

  bytes (): Uint8Array {
    const versionBytes = new Uint8Array(2)
    const modeBytes = new Uint8Array(2)

    new DataView(versionBytes.buffer).setUint16(0, this.version, true)
    new DataView(modeBytes.buffer).setUint16(0, this.mode, true)

    const proTxHashBytes = new Uint8Array(32)
    proTxHashBytes.set(hexToBytes(this.proTxHash).toReversed())

    const pubKeyOperatorBytes = new Uint8Array(48)
    pubKeyOperatorBytes.set(hexToBytes(this.pubKeyOperator))

    const keyIdVotingBytes = new Uint8Array(20)
    keyIdVotingBytes.set(hexToBytes(this.keyIdVoting))

    const scriptPayoutBytes = this.scriptPayout.bytes()
    const scriptPayoutSizeBytes = encodeCompactSize(scriptPayoutBytes.byteLength)

    const inputsHashBytes = new Uint8Array(32)
    inputsHashBytes.set(hexToBytes(this.inputsHash).toReversed())

    const payloadSigBytes = hexToBytes(this.payloadSig)
    const payloadSigSizeBytes = encodeCompactSize(payloadSigBytes.byteLength)

    const outBytes = new Uint8Array(136 + scriptPayoutSizeBytes.byteLength + scriptPayoutBytes.byteLength + payloadSigSizeBytes.byteLength + payloadSigBytes.byteLength)

    outBytes.set(versionBytes, 0)
    outBytes.set(proTxHashBytes, 2)
    outBytes.set(modeBytes, 34)
    outBytes.set(pubKeyOperatorBytes, 36)
    outBytes.set(keyIdVotingBytes, 84)
    outBytes.set(scriptPayoutSizeBytes, 104)
    outBytes.set(scriptPayoutBytes, 104 + scriptPayoutSizeBytes.byteLength)
    outBytes.set(inputsHashBytes, 104 + scriptPayoutSizeBytes.byteLength + scriptPayoutBytes.byteLength)
    outBytes.set(payloadSigSizeBytes, 136 + scriptPayoutSizeBytes.byteLength + scriptPayoutBytes.byteLength)
    outBytes.set(payloadSigBytes, 136 + scriptPayoutSizeBytes.byteLength + scriptPayoutBytes.byteLength + payloadSigSizeBytes.byteLength)

    return outBytes
  }

  hex (): string {
    return bytesToHex(this.bytes())
  }

  toJSON (): ProUpRegTxJSON {
    return {
      inputsHash: this.inputsHash,
      keyIdVoting: this.keyIdVoting,
      mode: this.mode,
      payloadSig: this.payloadSig,
      proTxHash: this.proTxHash,
      pubKeyOperator: this.pubKeyOperator,
      scriptPayout: this.scriptPayout.ASMString(),
      version: this.version

    }
  }
}
