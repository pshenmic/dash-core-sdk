import { Script } from '../Script.js'
import {
  bytesToHex,
  bytesToIp,
  decodeCompactSize,
  encodeCompactSize,
  getCompactVariableSize,
  hexToBytes,
  ipToBytes
} from '../../utils.js'
import { NetworkLike, ProUpServTxJSON } from '../../types.js'
import { DEFAULT_NETWORK } from '../../constants.js'

export class ProUpServTx {
  version: number
  // type 0 = mn, type 1 = evo
  type: number

  proTxHash: string

  ipAddress: string
  port: number
  // netInfo: Uint8Array

  scriptOperatorPayout: Script
  inputsHash: string

  // only if version == 2
  platformNodeID?: string
  platformP2PPort?: number
  platformHTTPPort?: number

  payloadSig: string

  constructor (version: number, type: number, proTxHash: string, ipAddress: string, port: number, /* netInfo: Uint8Array, */ scriptOperatorPayout: Script, inputsHash: string, platformNodeID: string, platformP2PPort: number, platformHTTPPort: number, payloadSig: string) {
    this.version = version
    this.type = type

    this.proTxHash = proTxHash

    this.ipAddress = ipAddress
    this.port = port
    // this.netInfo = netInfo;

    this.scriptOperatorPayout = scriptOperatorPayout
    this.inputsHash = inputsHash

    this.platformNodeID = platformNodeID
    this.platformP2PPort = platformP2PPort
    this.platformHTTPPort = platformHTTPPort

    this.payloadSig = payloadSig
  }

  getOperatorPayoutAddress (network: NetworkLike = DEFAULT_NETWORK): string | undefined {
    return this.scriptOperatorPayout.getAddress(network)
  }

  static fromBytes (bytes: Uint8Array): ProUpServTx {
    const dataView = new DataView(bytes.buffer)

    const version = dataView.getUint16(0, true)
    const type = dataView.getUint16(2, true)

    const proTxHash = bytes.slice(4, 36)

    let ipAddress: Uint8Array
    let port: number

    if (version < 3) {
      ipAddress = bytes.slice(36, 52)

      port = dataView.getUint16(52, false)
    } else {
      throw new Error(`Unsupported version of ProUpServTX: ${version}`)
    }

    const scriptPayoutSize = decodeCompactSize(54, bytes)
    const scriptOperatorPayout = Script.fromBytes(bytes.slice(54 + getCompactVariableSize(scriptPayoutSize), 54 + getCompactVariableSize(scriptPayoutSize) + Number(scriptPayoutSize)))

    const inputsHashOffset = 54 + getCompactVariableSize(scriptPayoutSize) + Number(scriptPayoutSize)
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

    const payloadSig = bytes.slice(payloadSigOffset, payloadSigOffset + 96)

    return new ProUpServTx(version, type, bytesToHex(proTxHash.toReversed()), bytesToIp(ipAddress), port, scriptOperatorPayout, bytesToHex(inputsHash.toReversed()), bytesToHex(platformNodeID.toReversed()), platformP2PPort, platformHTTPPort, bytesToHex(payloadSig))
  }

  static fromHex (hex: string): ProUpServTx {
    return ProUpServTx.fromBytes(hexToBytes(hex))
  }

  bytes (): Uint8Array {
    const versionBytes = new Uint8Array(2)
    const typeBytes = new Uint8Array(2)

    new DataView(versionBytes.buffer).setUint16(0, this.version, true)
    new DataView(typeBytes.buffer).setUint16(0, this.type, true)

    const proTxHashBytes = new Uint8Array(hexToBytes(this.proTxHash).toReversed())

    const ipAddressBytes = ipToBytes(this.ipAddress)

    const portBytes = new Uint8Array(2)

    new DataView(portBytes.buffer).setUint16(0, this.port, false)

    const scriptOperatorPayoutBytes = this.scriptOperatorPayout.bytes()
    const scriptOperatorPayoutSizeBytes = encodeCompactSize(scriptOperatorPayoutBytes.byteLength)

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

    const outBytes = new Uint8Array(54 + scriptOperatorPayoutSizeBytes.byteLength + scriptOperatorPayoutBytes.byteLength + inputsHashBytes.byteLength + platformNodeIDBytes.byteLength + platformP2PPortBytes.byteLength + platformHTTPPortBytes.byteLength + payloadSigBytes.byteLength)

    const payoutScriptOffset = versionBytes.byteLength + typeBytes.byteLength + proTxHashBytes.byteLength + ipAddressBytes.byteLength + portBytes.byteLength
    const platformInfoOffset = payoutScriptOffset + scriptOperatorPayoutSizeBytes.byteLength + scriptOperatorPayoutBytes.byteLength + inputsHashBytes.byteLength
    const payloadSigOffset = platformInfoOffset + platformNodeIDBytes.byteLength + platformP2PPortBytes.byteLength + platformHTTPPortBytes.byteLength

    outBytes.set(versionBytes, 0)
    outBytes.set(typeBytes, versionBytes.byteLength)
    outBytes.set(proTxHashBytes, versionBytes.byteLength + typeBytes.byteLength)
    outBytes.set(ipAddressBytes, versionBytes.byteLength + typeBytes.byteLength + proTxHashBytes.byteLength)
    outBytes.set(portBytes, versionBytes.byteLength + typeBytes.byteLength + proTxHashBytes.byteLength + ipAddressBytes.byteLength)
    outBytes.set(scriptOperatorPayoutSizeBytes, payoutScriptOffset)
    outBytes.set(scriptOperatorPayoutBytes, payoutScriptOffset + scriptOperatorPayoutSizeBytes.byteLength)
    outBytes.set(inputsHashBytes, payoutScriptOffset + scriptOperatorPayoutSizeBytes.byteLength + scriptOperatorPayoutBytes.byteLength)
    outBytes.set(platformNodeIDBytes, platformInfoOffset)
    outBytes.set(platformP2PPortBytes, platformInfoOffset + platformNodeIDBytes.byteLength)
    outBytes.set(platformHTTPPortBytes, platformInfoOffset + platformNodeIDBytes.byteLength + platformP2PPortBytes.byteLength)
    outBytes.set(payloadSigBytes, payloadSigOffset)

    return outBytes
  }

  hex (): string {
    return bytesToHex(this.bytes())
  }

  toJSON (): ProUpServTxJSON {
    return {
      payloadSig: this.payloadSig,
      proTxHash: this.proTxHash,
      scriptOperatorPayout: this.scriptOperatorPayout.ASMString(),
      inputsHash: this.inputsHash,
      ipAddress: this.ipAddress,
      port: this.port,
      type: this.type,
      version: this.version
    }
  }
}
