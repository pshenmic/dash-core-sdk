import {
  bytesToHex,
  publicKeyHashToAddress,
  hexToBytes
} from '../../utils.js'
import { NetworkLike, ProUpSharedRegTxJSON } from '../../types.js'
import { COMPACT_SIGNATURE_SIZE, DEFAULT_NETWORK } from '../../constants.js'

export class ProUpSharedRegTx {
  version: number
  proTxHash: string

  pubKeyOperator: string
  keyIdVoting: string
  inputsHash: string

  sigs: string[]

  constructor (version: number, proTxHash: string, pubKeyOperator: string, keyIdVoting: string, inputsHash: string, sigs: string[]) {
    this.version = version
    this.proTxHash = proTxHash

    this.pubKeyOperator = pubKeyOperator
    this.keyIdVoting = keyIdVoting
    this.inputsHash = inputsHash

    this.sigs = sigs
  }

  getVotingAddress (network: NetworkLike = DEFAULT_NETWORK): string {
    return publicKeyHashToAddress(hexToBytes(this.keyIdVoting), network)
  }

  static fromBytes (bytes: Uint8Array): ProUpSharedRegTx {
    const dataView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

    const version = dataView.getUint16(0, true)

    const proTxHash = bytes.slice(2, 34)

    const pubKeyOperator = bytes.slice(34, 82)
    const keyIdVoting = bytes.slice(82, 102)

    const inputsHash = bytes.slice(102, 134)

    const sigCount = dataView.getUint8(134)

    const sigs: string[] = []

    for (let i = 0; i < sigCount; i++) {
      const offset = 135 + i * COMPACT_SIGNATURE_SIZE
      sigs.push(bytesToHex(bytes.slice(offset, offset + COMPACT_SIGNATURE_SIZE)))
    }

    return new ProUpSharedRegTx(version, bytesToHex(proTxHash.toReversed()), bytesToHex(pubKeyOperator), bytesToHex(keyIdVoting), bytesToHex(inputsHash.toReversed()), sigs)
  }

  static fromHex (hex: string): ProUpSharedRegTx {
    return ProUpSharedRegTx.fromBytes(hexToBytes(hex))
  }

  bytes (): Uint8Array {
    const versionBytes = new Uint8Array(2)

    new DataView(versionBytes.buffer, versionBytes.byteOffset, versionBytes.byteLength).setUint16(0, this.version, true)

    const proTxHashBytes = new Uint8Array(32)
    proTxHashBytes.set(hexToBytes(this.proTxHash).toReversed())

    const pubKeyOperatorBytes = new Uint8Array(48)
    pubKeyOperatorBytes.set(hexToBytes(this.pubKeyOperator))

    const keyIdVotingBytes = new Uint8Array(20)
    keyIdVotingBytes.set(hexToBytes(this.keyIdVoting))

    const inputsHashBytes = new Uint8Array(32)
    inputsHashBytes.set(hexToBytes(this.inputsHash).toReversed())

    const outBytes = new Uint8Array(135 + this.sigs.length * COMPACT_SIGNATURE_SIZE)

    outBytes.set(versionBytes, 0)
    outBytes.set(proTxHashBytes, 2)
    outBytes.set(pubKeyOperatorBytes, 34)
    outBytes.set(keyIdVotingBytes, 82)
    outBytes.set(inputsHashBytes, 102)
    outBytes.set([this.sigs.length], 134)

    this.sigs.forEach((sig, i) => {
      outBytes.set(hexToBytes(sig), 135 + i * COMPACT_SIGNATURE_SIZE)
    })

    return outBytes
  }

  hex (): string {
    return bytesToHex(this.bytes())
  }

  toJSON (): ProUpSharedRegTxJSON {
    return {
      inputsHash: this.inputsHash,
      keyIdVoting: this.keyIdVoting,
      proTxHash: this.proTxHash,
      pubKeyOperator: this.pubKeyOperator,
      sigs: this.sigs,
      version: this.version
    }
  }
}
