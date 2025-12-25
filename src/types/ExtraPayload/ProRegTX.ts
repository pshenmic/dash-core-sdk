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
import { DEFAULT_NETWORK } from '../../constants.js'

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

  // only if version == 2
  platformNodeID?: string
  platformP2PPort?: number
  platformHTTPPort?: number

  payloadSig: string

  constructor (version: number, type: number, mode: number, collateralOutpoint: OutPoint, ipAddress: string, port: number, /* netInfo: Uint8Array, */ keyIdOwner: string, pubKeyOperator: string, keyIdVoting: string, operatorReward: number, scriptPayout: Script, inputsHash: string, platformNodeID: string, platformP2PPort: number, platformHTTPPort: number, payloadSig: string) {
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
    const dataView = new DataView(bytes.buffer)

    const version = dataView.getUint16(0, true)
    const type = dataView.getUint16(2, true)

    const mode = dataView.getUint16(4, true)

    const colateralOutpoint = OutPoint.fromBytes(bytes.slice(6, 42))

    let ipAddress: Uint8Array
    let port: number

    if (version < 3) {
      ipAddress = bytes.slice(42, 58)

      port = dataView.getUint16(58, false)
    } else {
      throw new Error(`Unsupported version of ProRegTX: ${version}`)
    }

    const keyIdOwner = bytes.slice(60, 80)
    const pubKeyOperator = bytes.slice(80, 128)
    const keyIdVoting = bytes.slice(128, 148)

    const operatorReward = dataView.getUint16(148, true)

    const scriptPayoutSize = decodeCompactSize(150, bytes)
    const scriptPayout = Script.fromBytes(bytes.slice(150 + getCompactVariableSize(scriptPayoutSize), 150 + getCompactVariableSize(scriptPayoutSize) + Number(scriptPayoutSize)))

    const inputsHashOffset = 150 + getCompactVariableSize(scriptPayoutSize) + Number(scriptPayoutSize)
    const inputsHash = bytes.slice(inputsHashOffset, inputsHashOffset + 32)

    let platformNodeID
    let platformP2PPort
    let platformHTTPPort

    let payloadSigOffset = inputsHashOffset + 32

    if (version === 2) {
      platformNodeID = bytes.slice(inputsHashOffset + 32, inputsHashOffset + 32 + 20)
      platformP2PPort = dataView.getUint16(inputsHashOffset + 32 + 20, true)
      platformHTTPPort = dataView.getUint16(inputsHashOffset + 32 + 22, true)

      payloadSigOffset += 24
    }

    const payloadSigSize = decodeCompactSize(payloadSigOffset, bytes)
    const payloadSig = bytes.slice(payloadSigOffset + getCompactVariableSize(payloadSigSize), payloadSigOffset + getCompactVariableSize(payloadSigSize) + Number(payloadSigSize))

    return new ProRegTX(version, type, mode, colateralOutpoint, bytesToIp(ipAddress), port, bytesToHex(keyIdOwner), bytesToHex(pubKeyOperator), bytesToHex(keyIdVoting), operatorReward, scriptPayout, bytesToHex(inputsHash.toReversed()), bytesToHex(platformNodeID.toReversed()), platformP2PPort, platformHTTPPort, bytesToHex(payloadSig))
  }

  static fromHex (hex: string): ProRegTX {
    return ProRegTX.fromBytes(hexToBytes(hex))
  }

  bytes (): Uint8Array {
    const versionBytes = new Uint8Array(2)
    const typeBytes = new Uint8Array(2)
    const modeBytes = new Uint8Array(2)

    new DataView(versionBytes.buffer).setUint16(0, this.version, true)
    new DataView(typeBytes.buffer).setUint16(0, this.type, true)
    new DataView(modeBytes.buffer).setUint16(0, this.mode, true)

    const collateralOutpointBytes = this.collateralOutpoint.bytes()

    const ipAddressBytes = ipToBytes(this.ipAddress)

    const portBytes = new Uint8Array(2)

    new DataView(portBytes.buffer).setUint16(0, this.port, false)

    const keyIdBytes = hexToBytes(this.keyIdOwner)
    const pubKeyOperatorBytes = hexToBytes(this.pubKeyOperator)
    const keyIdVotingBytes = hexToBytes(this.keyIdVoting)

    const operatorRewardBytes = new Uint8Array(2)

    new DataView(operatorRewardBytes.buffer).setUint16(0, this.operatorReward, true)

    const scriptPayoutBytes = this.scriptPayout.bytes()
    const scriptPayoutSizeBytes = encodeCompactSize(scriptPayoutBytes.byteLength)

    const inputsHashBytes = hexToBytes(this.inputsHash).toReversed()

    let platformNodeIDBytes: Uint8Array<ArrayBufferLike> = new Uint8Array(0)
    let platformP2PPortBytes: Uint8Array<ArrayBufferLike> = new Uint8Array(0)
    let platformHTTPPortBytes: Uint8Array<ArrayBufferLike> = new Uint8Array(0)

    if (this.version === 2) {
      platformNodeIDBytes = hexToBytes(this.platformNodeID ?? '').toReversed()
      platformP2PPortBytes = new Uint8Array(2)
      platformHTTPPortBytes = new Uint8Array(2)

      new DataView(platformP2PPortBytes.buffer).setUint16(0, this.platformP2PPort ?? 0, true)
      new DataView(platformHTTPPortBytes.buffer).setUint16(0, this.platformHTTPPort ?? 0, true)
    }

    const payloadSigBytes = hexToBytes(this.payloadSig)
    const payloadSigSizeBytes = encodeCompactSize(payloadSigBytes.byteLength)

    const ipAddressOffset = versionBytes.byteLength + typeBytes.byteLength + modeBytes.byteLength + collateralOutpointBytes.byteLength
    const pubKeyOperatorOffset = ipAddressOffset + ipAddressBytes.byteLength + portBytes.byteLength + keyIdBytes.byteLength
    const scriptOffset = pubKeyOperatorOffset + pubKeyOperatorBytes.byteLength + keyIdVotingBytes.byteLength + operatorRewardBytes.byteLength
    const platformInfoOffset = scriptOffset + scriptPayoutSizeBytes.byteLength + scriptPayoutBytes.byteLength + inputsHashBytes.byteLength
    const payloadSigOffset = platformInfoOffset + platformNodeIDBytes.byteLength + platformHTTPPortBytes.byteLength + platformHTTPPortBytes.byteLength

    const outBytes = new Uint8Array(182 + scriptPayoutSizeBytes.byteLength + scriptPayoutBytes.byteLength + platformNodeIDBytes.byteLength + platformP2PPortBytes.byteLength + platformHTTPPortBytes.byteLength + payloadSigSizeBytes.byteLength + payloadSigBytes.byteLength)

    outBytes.set(versionBytes, 0)
    outBytes.set(typeBytes, versionBytes.byteLength)
    outBytes.set(modeBytes, versionBytes.byteLength + typeBytes.byteLength)
    outBytes.set(collateralOutpointBytes, versionBytes.byteLength + typeBytes.byteLength + modeBytes.byteLength)
    outBytes.set(ipAddressBytes, ipAddressOffset)
    outBytes.set(portBytes, ipAddressOffset + ipAddressBytes.byteLength)
    outBytes.set(keyIdBytes, ipAddressOffset + ipAddressBytes.byteLength + portBytes.byteLength)
    outBytes.set(pubKeyOperatorBytes, pubKeyOperatorOffset)
    outBytes.set(keyIdVotingBytes, pubKeyOperatorOffset + pubKeyOperatorBytes.byteLength)
    outBytes.set(operatorRewardBytes, pubKeyOperatorOffset + pubKeyOperatorBytes.byteLength + keyIdVotingBytes.byteLength)
    outBytes.set(scriptPayoutSizeBytes, scriptOffset)
    outBytes.set(scriptPayoutBytes, scriptOffset + scriptPayoutSizeBytes.byteLength)
    outBytes.set(inputsHashBytes, scriptOffset + scriptPayoutSizeBytes.byteLength + scriptPayoutBytes.byteLength)
    outBytes.set(platformNodeIDBytes, platformInfoOffset)
    outBytes.set(platformP2PPortBytes, platformInfoOffset + platformNodeIDBytes.byteLength)
    outBytes.set(platformHTTPPortBytes, platformInfoOffset + platformNodeIDBytes.byteLength + platformHTTPPortBytes.byteLength)
    outBytes.set(payloadSigSizeBytes, payloadSigOffset)
    outBytes.set(payloadSigBytes, payloadSigOffset + payloadSigSizeBytes.byteLength)

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
      version: this.version
    }
  }
}
