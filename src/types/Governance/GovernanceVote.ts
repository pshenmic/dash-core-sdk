import { OutPoint } from '../OutPoint.js'
import { concatBytes } from '@noble/hashes/utils.js'
import {
  bytesToHex,
  decodeCompactSize,
  doubleSHA256,
  encodeCompactSize,
  getCompactVariableSize,
  hexToBytes,
  networkValueToEnumValue
} from '../../utils.js'
import { GovernanceVoteJSON, NetworkLike } from '../../types.js'
import { Network, VoteOutcome, VoteSignal } from '../../constants.js'
import { PrivateKey } from '../PrivateKey.js'
import { PublicKey } from '../PublicKey.js'
import { recoverHashSigner, recoverMessageSigner, signHash, signMessage } from '../../signing.js'
import { hash32Bytes, outPointAsTxIn } from './GovernanceObject.js'

/**
 * Masternode vote on a governance object (Dash Core CGovernanceVote)
 *
 * Wire order: masternode outpoint, parent hash, outcome, signal, time, signature
 */
export class GovernanceVote {
  masternodeOutpoint: OutPoint
  parentHash: string
  outcome: VoteOutcome
  signal: VoteSignal
  // unix seconds
  time: number
  signature: string

  constructor (masternodeOutpoint: OutPoint, parentHash: string, outcome: VoteOutcome, signal: VoteSignal, time: number, signature: string = '') {
    this.masternodeOutpoint = masternodeOutpoint
    this.parentHash = parentHash
    this.outcome = outcome
    this.signal = signal
    this.time = time
    this.signature = signature
  }

  static fromBytes (bytes: Uint8Array): GovernanceVote {
    const dataView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

    const masternodeOutpoint = OutPoint.fromBytes(bytes.slice(0, 36))
    const parentHash = bytes.slice(36, 68)
    const outcome = dataView.getInt32(68, true)
    const signal = dataView.getInt32(72, true)
    const time = Number(dataView.getBigInt64(76, true))

    const signatureSize = Number(decodeCompactSize(84, bytes))
    const signatureStart = 84 + getCompactVariableSize(signatureSize)

    if (signatureStart + signatureSize > bytes.byteLength) {
      throw new Error('Governance vote is truncated')
    }

    const signature = bytes.slice(signatureStart, signatureStart + signatureSize)

    return new GovernanceVote(masternodeOutpoint, bytesToHex(parentHash.toReversed()), outcome, signal, time, bytesToHex(signature))
  }

  static fromHex (hex: string): GovernanceVote {
    return GovernanceVote.fromBytes(hexToBytes(hex))
  }

  #fields (): Uint8Array {
    const fields = new Uint8Array(84)
    const view = new DataView(fields.buffer)

    fields.set(this.masternodeOutpoint.bytes(), 0)
    fields.set(hash32Bytes(this.parentHash), 36)
    view.setInt32(68, this.outcome, true)
    view.setInt32(72, this.signal, true)
    view.setBigInt64(76, BigInt(this.time), true)

    return fields
  }

  bytes (): Uint8Array {
    const signatureBytes = hexToBytes(this.signature)

    return concatBytes(this.#fields(), encodeCompactSize(signatureBytes.byteLength), signatureBytes)
  }

  hex (): string {
    return bytesToHex(this.bytes())
  }

  /**
   * Vote hash, how nodes index the vote (Dash Core CGovernanceVote::GetHash)
   *
   * Doesn't match the serialization: the outpoint is padded to a CTxIn, signal comes before outcome
   * and the signature is excluded
   */
  hash (): string {
    const hashed = new Uint8Array(89)
    const view = new DataView(hashed.buffer)

    hashed.set(outPointAsTxIn(this.masternodeOutpoint), 0)
    hashed.set(hash32Bytes(this.parentHash), 41)
    view.setInt32(73, this.signal, true)
    view.setInt32(77, this.outcome, true)
    view.setBigInt64(81, BigInt(this.time), true)

    const hashBytes = doubleSHA256(hashed)

    return bytesToHex(hashBytes.toReversed())
  }

  /**
   * SHA256d of the fields in wire order without the signature, what testnet votes sign (Dash Core GetSignatureHash)
   */
  signatureHash (): Uint8Array {
    return doubleSHA256(this.#fields())
  }

  /**
   * Message every network but testnet signs: txid-vout|parent|signal|outcome|time
   */
  signString (): string {
    return `${this.masternodeOutpoint.txId}-${this.masternodeOutpoint.vOut}|${this.parentHash}|${this.signal}|${this.outcome}|${this.time}`
  }

  /**
   * Sign with the masternode voting key
   *
   * Testnet signs signatureHash, every other network signs signString as a message
   */
  sign (privateKey: PrivateKey, network: NetworkLike = privateKey.network): void {
    const signature = networkValueToEnumValue(network) === Network.Testnet
      ? signHash(this.signatureHash(), privateKey)
      : signMessage(this.signString(), privateKey)

    this.signature = bytesToHex(signature)
  }

  /**
   * Public key that signed the vote under the network's signature rule, compare its address to the voting address
   */
  recoverSigner (network: NetworkLike): PublicKey {
    const signature = hexToBytes(this.signature)

    return networkValueToEnumValue(network) === Network.Testnet
      ? recoverHashSigner(this.signatureHash(), signature)
      : recoverMessageSigner(this.signString(), signature)
  }

  toJSON (): GovernanceVoteJSON {
    return {
      masternodeOutpoint: this.masternodeOutpoint.toJSON(),
      parentHash: this.parentHash,
      outcome: this.outcome,
      signal: this.signal,
      time: this.time,
      signature: this.signature,
      hash: this.hash()
    }
  }
}
