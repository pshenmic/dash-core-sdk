import { OutPoint } from '../OutPoint.js'
import { Script } from '../Script.js'
import {
  bytesToHex,
  bytesToIp,
  decodeCompactSize,
  encodeCompactSize,
  getCompactVariableSize,
  hexToBytes,
  ipToBytes, publicKeyHashToAddress
} from '../../utils.js'
import { NetworkLike, ProRegTxJSON } from '../../types.js'
import { COMPACT_SIGNATURE_SIZE, DEFAULT_NETWORK, PROTX_VERSION_EXT_ADDR } from '../../constants.js'
import { ExtNetInfo, NetInfoPurpose } from '../ExtNetInfo.js'
import { PayoutShare } from '../PayoutShare.js'
import { CollateralShare } from '../CollateralShare.js'

/**
 * Fields that replace the address and the payout script since ProTx version 3
 */
export interface ProRegTxExtendedFields {
  netInfo: ExtNetInfo
  payouts: PayoutShare[]
  // non-empty = shared masternode registration
  shares: CollateralShare[]
  // one consent signature per share, in share order
  joinSigs: string[]
  earlyPeriodBlocks: number
  earlyPenalty: bigint
}

export class ProRegTX {
  version: number
  // type 0 = mn, type 1 = evo
  type: number
  mode: number

  collateralOutpoint: OutPoint

  ipAddress: string
  port: number
  // netInfo: Uint8Array

  keyIdOwner: string
  keyIdVoting: string
  pubKeyOperator: string

  operatorReward: number
  scriptPayout: Script
  inputsHash: string

  // only if type == 1, ports only if version < 3
  platformNodeID?: string
  platformP2PPort?: number
  platformHTTPPort?: number

  payloadSig: string

  // only if version >= 3, ipAddress, port and scriptPayout then mirror the primary entries
  netInfo?: ExtNetInfo
  payouts?: PayoutShare[]
  shares?: CollateralShare[]
  joinSigs?: string[]
  earlyPeriodBlocks?: number
  earlyPenalty?: bigint

  constructor (version: number, type: number, mode: number, collateralOutpoint: OutPoint, ipAddress: string, port: number, /* netInfo: Uint8Array, */ keyIdOwner: string, pubKeyOperator: string, keyIdVoting: string, operatorReward: number, scriptPayout: Script, inputsHash: string, platformNodeID: string | undefined, platformP2PPort: number | undefined, platformHTTPPort: number | undefined, payloadSig: string, extended?: ProRegTxExtendedFields) {
    this.version = version
    this.type = type
    this.mode = mode

    this.collateralOutpoint = collateralOutpoint

    this.ipAddress = ipAddress
    this.port = port
    // this.netInfo = netInfo;

    this.keyIdOwner = keyIdOwner
    this.pubKeyOperator = pubKeyOperator
    this.keyIdVoting = keyIdVoting

    this.operatorReward = operatorReward
    this.scriptPayout = scriptPayout
    this.inputsHash = inputsHash

    this.platformNodeID = platformNodeID
    this.platformP2PPort = platformP2PPort
    this.platformHTTPPort = platformHTTPPort

    this.payloadSig = payloadSig

    this.netInfo = extended?.netInfo
    this.payouts = extended?.payouts
    this.shares = extended?.shares
    this.joinSigs = extended?.joinSigs
    this.earlyPeriodBlocks = extended?.earlyPeriodBlocks
    this.earlyPenalty = extended?.earlyPenalty
  }

  getOwnerAddress (network: NetworkLike = DEFAULT_NETWORK): string {
    return publicKeyHashToAddress(hexToBytes(this.keyIdOwner), network)
  }

  getVotingAddress (network: NetworkLike = DEFAULT_NETWORK): string {
    return publicKeyHashToAddress(hexToBytes(this.keyIdVoting), network)
  }

  getPayoutAddress (network: NetworkLike = DEFAULT_NETWORK): string | undefined {
    return this.scriptPayout.getAddress(network)
  }

  static fromBytes (bytes: Uint8Array): ProRegTX {
    const dataView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

    const version = dataView.getUint16(0, true)

    if (version === 0 || version > PROTX_VERSION_EXT_ADDR) {
      throw new Error(`Unsupported version of ProRegTX: ${version}`)
    }

    // Per Dash Core CProRegTx: nType is always serialized.
    const type = dataView.getUint16(2, true)
    const mode = dataView.getUint16(4, true)

    let cursor = 6

    const collateralOutpoint = OutPoint.fromBytes(bytes.slice(cursor, cursor + 36))
    cursor += 36

    let ipAddress: string
    let port: number
    let netInfo: ExtNetInfo | undefined

    if (version >= PROTX_VERSION_EXT_ADDR) {
      netInfo = ExtNetInfo.fromBytes(bytes.slice(cursor))
      cursor += netInfo.bytes().byteLength

      const primary = netInfo.getPrimaryEntry(NetInfoPurpose.CORE_P2P)
      ipAddress = primary?.address ?? ''
      port = primary?.port ?? 0
    } else {
      ipAddress = bytesToIp(bytes.slice(cursor, cursor + 16))
      cursor += 16

      port = dataView.getUint16(cursor, false)
      cursor += 2
    }

    const keyIdOwner = bytes.slice(cursor, cursor + 20)
    cursor += 20

    const pubKeyOperator = bytes.slice(cursor, cursor + 48)
    cursor += 48

    const keyIdVoting = bytes.slice(cursor, cursor + 20)
    cursor += 20

    const operatorReward = dataView.getUint16(cursor, true)
    cursor += 2

    let scriptPayout: Script
    let extended: ProRegTxExtendedFields | undefined

    if (version >= PROTX_VERSION_EXT_ADDR) {
      const payouts: PayoutShare[] = []
      const payoutsCount = dataView.getUint8(cursor)
      cursor += 1

      for (let i = 0; i < payoutsCount; i++) {
        const payout = PayoutShare.fromBytes(bytes.slice(cursor))
        cursor += payout.bytes().byteLength
        payouts.push(payout)
      }

      const shares: CollateralShare[] = []
      const sharesCount = dataView.getUint8(cursor)
      cursor += 1

      for (let i = 0; i < sharesCount; i++) {
        const share = CollateralShare.fromBytes(bytes.slice(cursor))
        cursor += share.bytes().byteLength
        shares.push(share)
      }

      const joinSigs: string[] = []

      for (let i = 0; i < sharesCount; i++) {
        joinSigs.push(bytesToHex(bytes.slice(cursor, cursor + COMPACT_SIGNATURE_SIZE)))
        cursor += COMPACT_SIGNATURE_SIZE
      }

      const earlyPeriodBlocks = dataView.getUint32(cursor, true)
      cursor += 4

      const earlyPenalty = dataView.getBigInt64(cursor, true)
      cursor += 8

      scriptPayout = payouts[0]?.scriptPayout ?? new Script()
      extended = { netInfo: netInfo as ExtNetInfo, payouts, shares, joinSigs, earlyPeriodBlocks, earlyPenalty }
    } else {
      const scriptPayoutSize = decodeCompactSize(cursor, bytes)
      cursor += getCompactVariableSize(scriptPayoutSize)
      scriptPayout = Script.fromBytes(bytes.slice(cursor, cursor + Number(scriptPayoutSize)))
      cursor += Number(scriptPayoutSize)
    }

    const inputsHash = bytes.slice(cursor, cursor + 32)
    cursor += 32

    let platformNodeID: Uint8Array | undefined
    let platformP2PPort: number | undefined
    let platformHTTPPort: number | undefined

    // Per Dash Core, platform fields exist iff nType == MnType::Evo (1).
    // Since version 3 platform ports are stored in netInfo.
    if (type === 1) {
      platformNodeID = bytes.slice(cursor, cursor + 20)
      cursor += 20

      if (version < PROTX_VERSION_EXT_ADDR) {
        platformP2PPort = dataView.getUint16(cursor, true)
        cursor += 2
        platformHTTPPort = dataView.getUint16(cursor, true)
        cursor += 2
      }
    }

    const payloadSigSize = decodeCompactSize(cursor, bytes)
    cursor += getCompactVariableSize(payloadSigSize)
    const payloadSig = bytes.slice(cursor, cursor + Number(payloadSigSize))

    return new ProRegTX(
      version,
      type,
      mode,
      collateralOutpoint,
      ipAddress,
      port,
      bytesToHex(keyIdOwner),
      bytesToHex(pubKeyOperator),
      bytesToHex(keyIdVoting),
      operatorReward,
      scriptPayout,
      bytesToHex(inputsHash.toReversed()),
      platformNodeID !== undefined ? bytesToHex(platformNodeID.toReversed()) : undefined,
      platformP2PPort,
      platformHTTPPort,
      bytesToHex(payloadSig),
      extended
    )
  }

  static fromHex (hex: string): ProRegTX {
    return ProRegTX.fromBytes(hexToBytes(hex))
  }

  bytes (): Uint8Array {
    const versionBytes = new Uint8Array(2)
    const typeBytes = new Uint8Array(2)
    const modeBytes = new Uint8Array(2)

    new DataView(versionBytes.buffer, versionBytes.byteOffset, versionBytes.byteLength).setUint16(0, this.version, true)
    new DataView(typeBytes.buffer, typeBytes.byteOffset, typeBytes.byteLength).setUint16(0, this.type, true)
    new DataView(modeBytes.buffer, modeBytes.byteOffset, modeBytes.byteLength).setUint16(0, this.mode, true)

    const isExtended = this.version >= PROTX_VERSION_EXT_ADDR

    const collateralOutpointBytes = this.collateralOutpoint.bytes()
    let ipAddressBytes: Uint8Array<ArrayBufferLike>
    let portBytes = new Uint8Array(0)

    if (isExtended) {
      ipAddressBytes = (this.netInfo ?? new ExtNetInfo()).bytes()
    } else {
      ipAddressBytes = ipToBytes(this.ipAddress)

      portBytes = new Uint8Array(2)
      new DataView(portBytes.buffer, portBytes.byteOffset, portBytes.byteLength).setUint16(0, this.port, false)
    }

    const keyIdBytes = hexToBytes(this.keyIdOwner)
    const pubKeyOperatorBytes = hexToBytes(this.pubKeyOperator)
    const keyIdVotingBytes = hexToBytes(this.keyIdVoting)

    const operatorRewardBytes = new Uint8Array(2)
    new DataView(operatorRewardBytes.buffer, operatorRewardBytes.byteOffset, operatorRewardBytes.byteLength).setUint16(0, this.operatorReward, true)

    let scriptPayoutBytes: Uint8Array<ArrayBufferLike>
    let scriptPayoutSizeBytes: Uint8Array<ArrayBufferLike>

    if (isExtended) {
      // payouts, shares, join signatures, early period and penalty take the place of the payout script
      const shares = this.shares ?? []
      const joinSigs = this.joinSigs ?? []

      if (joinSigs.length !== shares.length) {
        throw new Error('ProRegTX join signature count mismatch')
      }

      const earlyBytes = new Uint8Array(12)
      const earlyView = new DataView(earlyBytes.buffer)
      earlyView.setUint32(0, this.earlyPeriodBlocks ?? 0, true)
      earlyView.setBigInt64(4, this.earlyPenalty ?? 0n, true)

      const chunks = [
        ...(this.payouts ?? []).map(payout => payout.bytes()),
        new Uint8Array([shares.length]),
        ...shares.map(share => share.bytes()),
        ...joinSigs.map(sig => {
          const sigBytes = new Uint8Array(COMPACT_SIGNATURE_SIZE)
          sigBytes.set(hexToBytes(sig))
          return sigBytes
        }),
        earlyBytes
      ]

      scriptPayoutSizeBytes = new Uint8Array([this.payouts?.length ?? 0])
      scriptPayoutBytes = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.byteLength, 0))

      let chunkOffset = 0
      for (const chunk of chunks) {
        scriptPayoutBytes.set(chunk, chunkOffset)
        chunkOffset += chunk.byteLength
      }
    } else {
      scriptPayoutBytes = this.scriptPayout.bytes()
      scriptPayoutSizeBytes = encodeCompactSize(scriptPayoutBytes.byteLength)
    }

    const inputsHashBytes = hexToBytes(this.inputsHash).toReversed()

    let platformNodeIDBytes: Uint8Array<ArrayBufferLike> = new Uint8Array(0)
    let platformP2PPortBytes: Uint8Array<ArrayBufferLike> = new Uint8Array(0)
    let platformHTTPPortBytes: Uint8Array<ArrayBufferLike> = new Uint8Array(0)

    // Per Dash Core, platform fields exist iff nType == MnType::Evo (1).
    if (this.type === 1) {
      platformNodeIDBytes = hexToBytes(this.platformNodeID ?? '').toReversed()

      if (!isExtended) {
        platformP2PPortBytes = new Uint8Array(2)
        platformHTTPPortBytes = new Uint8Array(2)

        new DataView(platformP2PPortBytes.buffer, platformP2PPortBytes.byteOffset, platformP2PPortBytes.byteLength).setUint16(0, this.platformP2PPort ?? 0, true)
        new DataView(platformHTTPPortBytes.buffer, platformHTTPPortBytes.byteOffset, platformHTTPPortBytes.byteLength).setUint16(0, this.platformHTTPPort ?? 0, true)
      }
    }

    const payloadSigBytes = hexToBytes(this.payloadSig)
    const payloadSigSizeBytes = encodeCompactSize(payloadSigBytes.byteLength)

    const outBytes = new Uint8Array(
      versionBytes.byteLength +
      typeBytes.byteLength +
      modeBytes.byteLength +
      collateralOutpointBytes.byteLength +
      ipAddressBytes.byteLength +
      portBytes.byteLength +
      keyIdBytes.byteLength +
      pubKeyOperatorBytes.byteLength +
      keyIdVotingBytes.byteLength +
      operatorRewardBytes.byteLength +
      scriptPayoutSizeBytes.byteLength +
      scriptPayoutBytes.byteLength +
      inputsHashBytes.byteLength +
      platformNodeIDBytes.byteLength +
      platformP2PPortBytes.byteLength +
      platformHTTPPortBytes.byteLength +
      payloadSigSizeBytes.byteLength +
      payloadSigBytes.byteLength
    )

    let off = 0
    outBytes.set(versionBytes, off); off += versionBytes.byteLength
    outBytes.set(typeBytes, off); off += typeBytes.byteLength
    outBytes.set(modeBytes, off); off += modeBytes.byteLength
    outBytes.set(collateralOutpointBytes, off); off += collateralOutpointBytes.byteLength
    outBytes.set(ipAddressBytes, off); off += ipAddressBytes.byteLength
    outBytes.set(portBytes, off); off += portBytes.byteLength
    outBytes.set(keyIdBytes, off); off += keyIdBytes.byteLength
    outBytes.set(pubKeyOperatorBytes, off); off += pubKeyOperatorBytes.byteLength
    outBytes.set(keyIdVotingBytes, off); off += keyIdVotingBytes.byteLength
    outBytes.set(operatorRewardBytes, off); off += operatorRewardBytes.byteLength
    outBytes.set(scriptPayoutSizeBytes, off); off += scriptPayoutSizeBytes.byteLength
    outBytes.set(scriptPayoutBytes, off); off += scriptPayoutBytes.byteLength
    outBytes.set(inputsHashBytes, off); off += inputsHashBytes.byteLength
    outBytes.set(platformNodeIDBytes, off); off += platformNodeIDBytes.byteLength
    outBytes.set(platformP2PPortBytes, off); off += platformP2PPortBytes.byteLength
    outBytes.set(platformHTTPPortBytes, off); off += platformHTTPPortBytes.byteLength
    outBytes.set(payloadSigSizeBytes, off); off += payloadSigSizeBytes.byteLength
    outBytes.set(payloadSigBytes, off)

    return outBytes
  }

  hex (): string {
    return bytesToHex(this.bytes())
  }

  toJSON (): ProRegTxJSON {
    return {
      collateralOutpoint: this.collateralOutpoint,
      inputsHash: this.inputsHash,
      ipAddress: this.ipAddress,
      keyIdOwner: this.keyIdOwner,
      keyIdVoting: this.keyIdVoting,
      mode: this.mode,
      operatorReward: this.operatorReward,
      port: this.port,
      pubKeyOperator: this.pubKeyOperator,
      scriptPayout: this.scriptPayout.ASMString(),
      type: this.type,
      version: this.version,
      ...(this.version >= PROTX_VERSION_EXT_ADDR
        ? {
            netInfo: this.netInfo?.toJSON(),
            payouts: this.payouts?.map(payout => payout.toJSON()),
            shares: this.shares?.map(share => share.toJSON()),
            joinSigs: this.joinSigs,
            earlyPeriodBlocks: this.earlyPeriodBlocks,
            earlyPenalty: this.earlyPenalty?.toString()
          }
        : {})
    }
  }
}
