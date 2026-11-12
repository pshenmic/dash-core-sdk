import { OutPoint } from '../OutPoint.js'
import { concatBytes } from '@noble/hashes/utils.js'
import {
  bytesToHex,
  decodeCompactSize,
  doubleSHA256,
  encodeCompactSize,
  getCompactVariableSize,
  hexToBytes
} from '../../utils.js'
import { GovernanceObjectJSON, GovernanceProposal } from '../../types.js'
import { GovernanceObjectType } from '../../constants.js'

/**
 * Governance object: a proposal or a superblock trigger (Dash Core Governance::Object)
 *
 * Wire order: parent hash, revision, time, collateral hash, data, type, masternode outpoint, signature
 */
export class GovernanceObject {
  parentHash: string
  revision: number
  // unix seconds
  time: number
  collateralHash: string
  // hex of the data bytes, a JSON document
  data: string
  type: GovernanceObjectType
  masternodeOutpoint: OutPoint
  signature: string

  constructor (parentHash: string, revision: number, time: number, collateralHash: string, data: string, type: GovernanceObjectType, masternodeOutpoint: OutPoint, signature: string) {
    this.parentHash = parentHash
    this.revision = revision
    this.time = time
    this.collateralHash = collateralHash
    this.data = data
    this.type = type
    this.masternodeOutpoint = masternodeOutpoint
    this.signature = signature
  }

  static fromBytes (bytes: Uint8Array): GovernanceObject {
    const dataView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

    let cursor = 0

    const parentHash = bytes.slice(cursor, cursor + 32)
    cursor += 32

    const revision = dataView.getInt32(cursor, true)
    cursor += 4

    const time = Number(dataView.getBigInt64(cursor, true))
    cursor += 8

    const collateralHash = bytes.slice(cursor, cursor + 32)
    cursor += 32

    const dataSize = Number(decodeCompactSize(cursor, bytes))
    cursor += getCompactVariableSize(dataSize)
    const data = bytes.slice(cursor, cursor + dataSize)
    cursor += dataSize

    const type = dataView.getInt32(cursor, true)
    cursor += 4

    const masternodeOutpoint = OutPoint.fromBytes(bytes.slice(cursor, cursor + 36))
    cursor += 36

    const signatureSize = Number(decodeCompactSize(cursor, bytes))
    cursor += getCompactVariableSize(signatureSize)
    const signature = bytes.slice(cursor, cursor + signatureSize)
    cursor += signatureSize

    if (cursor > bytes.byteLength) {
      throw new Error('Governance object is truncated')
    }

    return new GovernanceObject(
      bytesToHex(parentHash.toReversed()),
      revision,
      time,
      bytesToHex(collateralHash.toReversed()),
      bytesToHex(data),
      type,
      masternodeOutpoint,
      bytesToHex(signature)
    )
  }

  static fromHex (hex: string): GovernanceObject {
    return GovernanceObject.fromBytes(hexToBytes(hex))
  }

  // parent hash, revision and time, the prefix the serialization and the hash share
  #header (): Uint8Array {
    const header = new Uint8Array(44)
    const view = new DataView(header.buffer)

    header.set(hash32Bytes(this.parentHash), 0)
    view.setInt32(32, this.revision, true)
    view.setBigInt64(36, BigInt(this.time), true)

    return header
  }

  bytes (): Uint8Array {
    const dataBytes = hexToBytes(this.data)
    const signatureBytes = hexToBytes(this.signature)

    const typeBytes = new Uint8Array(4)
    new DataView(typeBytes.buffer).setInt32(0, this.type, true)

    return concatBytes(
      this.#header(),
      hash32Bytes(this.collateralHash),
      encodeCompactSize(dataBytes.byteLength),
      dataBytes,
      typeBytes,
      this.masternodeOutpoint.bytes(),
      encodeCompactSize(signatureBytes.byteLength),
      signatureBytes
    )
  }

  hex (): string {
    return bytesToHex(this.bytes())
  }

  /**
   * Object hash, the parent hash its votes carry (Dash Core Governance::Object::GetHash)
   *
   * Doesn't match the serialization: covers parent, revision, time, the data as its hex string,
   * the outpoint padded to a CTxIn and the signature; type and collateral hash are excluded
   */
  hash (): string {
    // Core hashes HexStr(vchData), lowercase
    const dataHexBytes = new TextEncoder().encode(bytesToHex(hexToBytes(this.data)))
    const signatureBytes = hexToBytes(this.signature)

    const hashBytes = doubleSHA256(concatBytes(
      this.#header(),
      encodeCompactSize(dataHexBytes.byteLength),
      dataHexBytes,
      outPointAsTxIn(this.masternodeOutpoint),
      encodeCompactSize(signatureBytes.byteLength),
      signatureBytes
    ))

    return bytesToHex(hashBytes.toReversed())
  }

  /**
   * Data decoded as a UTF-8 string
   */
  dataString (): string {
    return new TextDecoder().decode(hexToBytes(this.data))
  }

  /**
   * Proposal fields of the JSON data, unwrapping the pre-0.14 [["proposal", {...}]] form
   */
  proposal (): GovernanceProposal {
    if (this.type !== GovernanceObjectType.PROPOSAL) {
      throw new Error(`Governance object of type ${this.type} is not a proposal`)
    }

    let parsed: unknown

    try {
      parsed = JSON.parse(this.dataString())
    } catch {
      throw new Error('Governance object data is not JSON')
    }

    if (Array.isArray(parsed)) {
      const [entry] = parsed

      if (!Array.isArray(entry) || entry[0] !== 'proposal') {
        throw new Error('Governance object data is not a wrapped proposal')
      }

      parsed = entry[1]
    }

    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Governance object data is not a proposal object')
    }

    return parsed as GovernanceProposal
  }

  toJSON (): GovernanceObjectJSON {
    return {
      parentHash: this.parentHash,
      revision: this.revision,
      time: this.time,
      collateralHash: this.collateralHash,
      data: this.data,
      type: this.type,
      masternodeOutpoint: this.masternodeOutpoint.toJSON(),
      signature: this.signature,
      hash: this.hash()
    }
  }
}

// uint256 from its display hex, zero when empty
export function hash32Bytes (hex: string): Uint8Array {
  const bytes = new Uint8Array(32)
  bytes.set(hexToBytes(hex).toReversed())

  return bytes
}

// CTxIn(outpoint): the outpoint, an empty scriptSig and the final sequence, for backwards compatible hashing
export function outPointAsTxIn (outPoint: OutPoint): Uint8Array {
  return concatBytes(outPoint.bytes(), new Uint8Array([0x00, 0xff, 0xff, 0xff, 0xff]))
}
