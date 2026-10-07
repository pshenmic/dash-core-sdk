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
import { DEFAULT_NETWORK, PROTX_VERSION_EXT_ADDR } from '../../constants.js'
import { PayoutShare } from '../PayoutShare.js'

export class ProUpRegTx {
  version: number
  proTxHash: string
  mode: number

  keyIdVoting: string
  pubKeyOperator: string

  scriptPayout: Script
  inputsHash: string

  payloadSig: string

  // only if version >= 3, scriptPayout then mirrors the first payout
  payouts?: PayoutShare[]

  constructor (version: number, proTxHash: string, mode: number, pubKeyOperator: string, keyIdVoting: string, scriptPayout: Script, inputsHash: string, payloadSig: string, payouts?: PayoutShare[]) {
    this.version = version
    this.proTxHash = proTxHash
    this.mode = mode

    this.pubKeyOperator = pubKeyOperator
    this.keyIdVoting = keyIdVoting

    this.scriptPayout = scriptPayout
    this.inputsHash = inputsHash

    this.payloadSig = payloadSig

    this.payouts = payouts
  }

  getVotingAddress (network: NetworkLike = DEFAULT_NETWORK): string {
    return publicKeyHashToAddress(hexToBytes(this.keyIdVoting), network)
  }

  getPayoutAddress (network: NetworkLike = DEFAULT_NETWORK): string | undefined {
    return this.scriptPayout.getAddress(network)
  }

  static fromBytes (bytes: Uint8Array): ProUpRegTx {
    const dataView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

    const version = dataView.getUint16(0, true)

    if (version === 0 || version > PROTX_VERSION_EXT_ADDR) {
      throw new Error(`Unsupported version of ProUpRegTx: ${version}`)
    }

    const proTxHash = bytes.slice(2, 34)

    const mode = dataView.getUint16(34, true)

    const pubKeyOperator = bytes.slice(36, 84)
    const keyIdVoting = bytes.slice(84, 104)

    let scriptPayout: Script
    let payouts: PayoutShare[] | undefined
    let inputsHashOffset: number

    if (version >= PROTX_VERSION_EXT_ADDR) {
      payouts = []
      const payoutsCount = dataView.getUint8(104)
      inputsHashOffset = 105

      for (let i = 0; i < payoutsCount; i++) {
        const payout = PayoutShare.fromBytes(bytes.slice(inputsHashOffset))
        inputsHashOffset += payout.bytes().byteLength
        payouts.push(payout)
      }

      scriptPayout = payouts[0]?.scriptPayout ?? new Script()
    } else {
      const scriptPayoutSize = decodeCompactSize(104, bytes)
      scriptPayout = Script.fromBytes(bytes.slice(104 + getCompactVariableSize(scriptPayoutSize), 104 + getCompactVariableSize(scriptPayoutSize) + Number(scriptPayoutSize)))

      inputsHashOffset = 104 + getCompactVariableSize(scriptPayoutSize) + Number(scriptPayoutSize)
    }
    const inputsHash = bytes.slice(inputsHashOffset, inputsHashOffset + 32)

    const payloadSigSize = decodeCompactSize(inputsHashOffset + 32, bytes)
    const payloadSig = bytes.slice(inputsHashOffset + 32 + getCompactVariableSize(payloadSigSize), inputsHashOffset + 32 + getCompactVariableSize(payloadSigSize) + Number(payloadSigSize))

    return new ProUpRegTx(version, bytesToHex(proTxHash.toReversed()), mode, bytesToHex(pubKeyOperator), bytesToHex(keyIdVoting), scriptPayout, bytesToHex(inputsHash.toReversed()), bytesToHex(payloadSig), payouts)
  }

  static fromHex (hex: string): ProUpRegTx {
    return ProUpRegTx.fromBytes(hexToBytes(hex))
  }

  bytes (): Uint8Array {
    const versionBytes = new Uint8Array(2)
    const modeBytes = new Uint8Array(2)

    new DataView(versionBytes.buffer, versionBytes.byteOffset, versionBytes.byteLength).setUint16(0, this.version, true)
    new DataView(modeBytes.buffer, modeBytes.byteOffset, modeBytes.byteLength).setUint16(0, this.mode, true)

    const proTxHashBytes = new Uint8Array(32)
    proTxHashBytes.set(hexToBytes(this.proTxHash).toReversed())

    const pubKeyOperatorBytes = new Uint8Array(48)
    pubKeyOperatorBytes.set(hexToBytes(this.pubKeyOperator))

    const keyIdVotingBytes = new Uint8Array(20)
    keyIdVotingBytes.set(hexToBytes(this.keyIdVoting))

    let scriptPayoutBytes: Uint8Array<ArrayBufferLike>
    let scriptPayoutSizeBytes: Uint8Array<ArrayBufferLike>

    if (this.version >= PROTX_VERSION_EXT_ADDR) {
      // payouts count and payouts take the place of the payout script
      const payouts = (this.payouts ?? []).map(payout => payout.bytes())

      scriptPayoutSizeBytes = new Uint8Array([payouts.length])
      scriptPayoutBytes = new Uint8Array(payouts.reduce((acc, payout) => acc + payout.byteLength, 0))

      let payoutOffset = 0
      for (const payout of payouts) {
        scriptPayoutBytes.set(payout, payoutOffset)
        payoutOffset += payout.byteLength
      }
    } else {
      scriptPayoutBytes = this.scriptPayout.bytes()
      scriptPayoutSizeBytes = encodeCompactSize(scriptPayoutBytes.byteLength)
    }

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
      version: this.version,
      ...(this.payouts != null ? { payouts: this.payouts.map(payout => payout.toJSON()) } : {})
    }
  }
}
