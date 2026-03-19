import { bytesToHex, decodeCompactSize, encodeCompactSize, getCompactVariableSize, hexToBytes } from '../../utils.js'
import { QfCommitJSON } from '../../types.js'

export class QfCommit {
  version: number
  llmqType: number
  quorumHash: string
  quorumIndex?: number
  signers: string
  validMembers: string
  quorumPublicKey: string
  quorumVvecHash: string
  quorumSig: string
  sig: string

  constructor (version: number, llmqType: number, quorumHash: string, signers: string, validMembers: string, quorumPublicKey: string, quorumVvecHash: string, quorumSig: string, sig: string, quorumIndex?: number) {
    this.version = version
    this.llmqType = llmqType
    this.quorumHash = quorumHash
    this.quorumIndex = quorumIndex
    this.signers = signers
    this.validMembers = validMembers
    this.quorumPublicKey = quorumPublicKey
    this.quorumVvecHash = quorumVvecHash
    this.quorumSig = quorumSig
    this.sig = sig
  }

  static fromBytes (bytes: Uint8Array): QfCommit {
    const dataView = new DataView(bytes.buffer)

    const version = dataView.getUint16(0, true)
    const llmqType = dataView.getUint8(2)

    const quorumHash = bytes.slice(3, 35)

    let signersOffset = 35
    let quorumIndex

    if (version >= 2) {
      quorumIndex = dataView.getUint16(35, true)
      signersOffset += 2
    }

    const signersBitsSize = decodeCompactSize(signersOffset, bytes)
    // https://docs.dash.org/en/stable/docs/core/reference/p2p-network-quorum-messages.html#qfcommit
    const signersSize = (Number(signersBitsSize) + 7) / 8
    const signers = bytes.slice(signersOffset + getCompactVariableSize(signersBitsSize), signersOffset + getCompactVariableSize(signersBitsSize) + signersSize)

    const validMembersOffset = signersOffset + getCompactVariableSize(signersBitsSize) + signersSize

    const validMembersBitsSize = decodeCompactSize(validMembersOffset, bytes)
    // https://docs.dash.org/en/stable/docs/core/reference/p2p-network-quorum-messages.html#qfcommit
    const validMembersSize = (Number(validMembersBitsSize) + 7) / 8
    const validMembers = bytes.slice(validMembersOffset + getCompactVariableSize(validMembersBitsSize), validMembersOffset + getCompactVariableSize(validMembersBitsSize) + validMembersSize)

    const quorumPublicKeyOffset = validMembersOffset + getCompactVariableSize(validMembersBitsSize) + validMembersSize

    const quorumPublicKey = bytes.slice(quorumPublicKeyOffset, quorumPublicKeyOffset + 48)
    const quorumVvecHash = bytes.slice(quorumPublicKeyOffset + 48, quorumPublicKeyOffset + 48 + 32)
    const quorumSig = bytes.slice(quorumPublicKeyOffset + 48 + 32, quorumPublicKeyOffset + 48 + 32 + 96)
    const sig = bytes.slice(quorumPublicKeyOffset + 48 + 32 + 96, quorumPublicKeyOffset + 48 + 32 + 96 + 96)

    return new QfCommit(version, llmqType, bytesToHex(quorumHash.toReversed()), bytesToHex(signers), bytesToHex(validMembers), bytesToHex(quorumPublicKey), bytesToHex(quorumVvecHash.toReversed()), bytesToHex(quorumSig), bytesToHex(sig), quorumIndex)
  }

  static fromHex (hex: string): QfCommit {
    return QfCommit.fromBytes(hexToBytes(hex))
  }

  bytes (): Uint8Array {
    const versionBytes = new Uint8Array(2)
    const llmqTypeBytes = new Uint8Array(1)

    new DataView(versionBytes.buffer).setUint16(0, this.version, true)
    new DataView(llmqTypeBytes.buffer).setUint8(0, this.llmqType)

    const quorumHashBytes = hexToBytes(this.quorumHash).toReversed()

    let quorumIndexBytes = new Uint8Array(0)

    if (this.version >= 2) {
      quorumIndexBytes = new Uint8Array(2)
      new DataView(quorumIndexBytes.buffer).setUint16(0, this.quorumIndex ?? 0, true)
    }

    const signersBytes = hexToBytes(this.signers)
    const signersBitsSizeBytes = encodeCompactSize(signersBytes.byteLength * 8 - 7)
    const validMembersBytes = hexToBytes(this.validMembers)
    const validMembersBitsSizeBytes = encodeCompactSize(validMembersBytes.byteLength * 8 - 7)

    const quorumPublicKeyBytes = hexToBytes(this.quorumPublicKey)
    const quorumVvecHashBytes = hexToBytes(this.quorumVvecHash).toReversed()
    const quorumSigBytes = hexToBytes(this.quorumSig)
    const sigBytes = hexToBytes(this.sig)

    const signersOffset = versionBytes.byteLength + llmqTypeBytes.byteLength + quorumHashBytes.byteLength + quorumIndexBytes.byteLength
    const quorumPublicKeyOffset = signersOffset + signersBitsSizeBytes.byteLength + signersBytes.byteLength + validMembersBitsSizeBytes.byteLength + validMembersBytes.byteLength

    const out = new Uint8Array(307 + signersBitsSizeBytes.byteLength + signersBytes.byteLength + validMembersBitsSizeBytes.byteLength + validMembersBytes.byteLength)

    out.set(versionBytes, 0)
    out.set(llmqTypeBytes, versionBytes.byteLength)
    out.set(quorumHashBytes, versionBytes.byteLength + llmqTypeBytes.byteLength)
    out.set(quorumIndexBytes, versionBytes.byteLength + llmqTypeBytes.byteLength + quorumHashBytes.byteLength)
    out.set(signersBitsSizeBytes, signersOffset)
    out.set(signersBytes, signersOffset + signersBitsSizeBytes.byteLength)
    out.set(validMembersBitsSizeBytes, signersOffset + signersBitsSizeBytes.byteLength + signersBytes.byteLength)
    out.set(validMembersBytes, signersOffset + signersBitsSizeBytes.byteLength + signersBytes.byteLength + validMembersBitsSizeBytes.byteLength)
    out.set(quorumPublicKeyBytes, quorumPublicKeyOffset)
    out.set(quorumVvecHashBytes, quorumPublicKeyOffset + quorumPublicKeyBytes.byteLength)
    out.set(quorumSigBytes, quorumPublicKeyOffset + quorumPublicKeyBytes.byteLength + quorumVvecHashBytes.byteLength)
    out.set(sigBytes, quorumPublicKeyOffset + quorumPublicKeyBytes.byteLength + quorumVvecHashBytes.byteLength + quorumSigBytes.byteLength)

    return out
  }

  hex (): string {
    return bytesToHex(this.bytes())
  }

  toJSON (): QfCommitJSON {
    return {
      version: this.version,
      llmqType: this.llmqType,
      validMembers: this.validMembers,
      quorumHash: this.quorumHash,
      quorumPublicKey: this.quorumPublicKey,
      quorumSig: this.quorumSig,
      quorumVvecHash: this.quorumVvecHash,
      sig: this.sig,
      signers: this.signers,
      quorumIndex: this.quorumIndex ?? null
    }
  }
}
