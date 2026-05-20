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

  constructor (version: number, type: number, proTxHash: string, ipAddress: string, port: number, /* netInfo: Uint8Array, */ scriptOperatorPayout: Script, inputsHash: string, platformNodeID: string | undefined, platformP2PPort: number | undefined, platformHTTPPort: number | undefined, payloadSig: string) {
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
    const dataView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

    const version = dataView.getUint16(0, true)

    if (version >= 3) {
      throw new Error(`Unsupported version of ProUpServTX: ${version}`)
    }

    let cursor = 2

    // Per Dash Core CProUpServTx: nType is only serialized when nVersion >= 2.
    let type = 0
    if (version >= 2) {
      type = dataView.getUint16(cursor, true)
      cursor += 2
    }

    const proTxHash = bytes.slice(cursor, cursor + 32)
    cursor += 32

    const ipAddress = bytes.slice(cursor, cursor + 16)
    cursor += 16

    const port = dataView.getUint16(cursor, false)
    cursor += 2

    const scriptPayoutSize = decodeCompactSize(cursor, bytes)
    cursor += getCompactVariableSize(scriptPayoutSize)
    const scriptOperatorPayout = Script.fromBytes(bytes.slice(cursor, cursor + Number(scriptPayoutSize)))
    cursor += Number(scriptPayoutSize)

    const inputsHash = bytes.slice(cursor, cursor + 32)
    cursor += 32

    let platformNodeID: Uint8Array | undefined
    let platformP2PPort: number | undefined
    let platformHTTPPort: number | undefined

    // Per Dash Core, platform fields exist iff nType == MnType::Evo (1).
    if (type === 1) {
      platformNodeID = bytes.slice(cursor, cursor + 20)
      cursor += 20
      platformP2PPort = dataView.getUint16(cursor, true)
      cursor += 2
      platformHTTPPort = dataView.getUint16(cursor, true)
      cursor += 2
    }

    const payloadSig = bytes.slice(cursor, cursor + 96)

    return new ProUpServTx(
      version,
      type,
      bytesToHex(proTxHash.toReversed()),
      bytesToIp(ipAddress),
      port,
      scriptOperatorPayout,
      bytesToHex(inputsHash.toReversed()),
      platformNodeID !== undefined ? bytesToHex(platformNodeID.toReversed()) : undefined,
      platformP2PPort,
      platformHTTPPort,
      bytesToHex(payloadSig)
    )
  }

  static fromHex (hex: string): ProUpServTx {
    return ProUpServTx.fromBytes(hexToBytes(hex))
  }

  bytes (): Uint8Array {
    const versionBytes = new Uint8Array(2)
    new DataView(versionBytes.buffer, versionBytes.byteOffset, versionBytes.byteLength).setUint16(0, this.version, true)

    // Per Dash Core CProUpServTx: nType is only serialized when nVersion >= 2.
    let typeBytes = new Uint8Array(0)
    if (this.version >= 2) {
      typeBytes = new Uint8Array(2)
      new DataView(typeBytes.buffer, typeBytes.byteOffset, typeBytes.byteLength).setUint16(0, this.type, true)
    }

    const proTxHashBytes = new Uint8Array(hexToBytes(this.proTxHash).toReversed())

    const ipAddressBytes = ipToBytes(this.ipAddress)

    const portBytes = new Uint8Array(2)
    new DataView(portBytes.buffer, portBytes.byteOffset, portBytes.byteLength).setUint16(0, this.port, false)

    const scriptOperatorPayoutBytes = this.scriptOperatorPayout.bytes()
    const scriptOperatorPayoutSizeBytes = encodeCompactSize(scriptOperatorPayoutBytes.byteLength)

    const inputsHashBytes = hexToBytes(this.inputsHash).toReversed()

    let platformNodeIDBytes: Uint8Array<ArrayBufferLike> = new Uint8Array(0)
    let platformP2PPortBytes: Uint8Array<ArrayBufferLike> = new Uint8Array(0)
    let platformHTTPPortBytes: Uint8Array<ArrayBufferLike> = new Uint8Array(0)

    // Per Dash Core, platform fields exist iff nType == MnType::Evo (1).
    if (this.type === 1) {
      platformNodeIDBytes = hexToBytes(this.platformNodeID ?? '').toReversed()
      platformP2PPortBytes = new Uint8Array(2)
      platformHTTPPortBytes = new Uint8Array(2)

      new DataView(platformP2PPortBytes.buffer, platformP2PPortBytes.byteOffset, platformP2PPortBytes.byteLength).setUint16(0, this.platformP2PPort ?? 0, true)
      new DataView(platformHTTPPortBytes.buffer, platformHTTPPortBytes.byteOffset, platformHTTPPortBytes.byteLength).setUint16(0, this.platformHTTPPort ?? 0, true)
    }

    const payloadSigBytes = hexToBytes(this.payloadSig)

    const outBytes = new Uint8Array(
      versionBytes.byteLength +
      typeBytes.byteLength +
      proTxHashBytes.byteLength +
      ipAddressBytes.byteLength +
      portBytes.byteLength +
      scriptOperatorPayoutSizeBytes.byteLength +
      scriptOperatorPayoutBytes.byteLength +
      inputsHashBytes.byteLength +
      platformNodeIDBytes.byteLength +
      platformP2PPortBytes.byteLength +
      platformHTTPPortBytes.byteLength +
      payloadSigBytes.byteLength
    )

    let off = 0
    outBytes.set(versionBytes, off); off += versionBytes.byteLength
    outBytes.set(typeBytes, off); off += typeBytes.byteLength
    outBytes.set(proTxHashBytes, off); off += proTxHashBytes.byteLength
    outBytes.set(ipAddressBytes, off); off += ipAddressBytes.byteLength
    outBytes.set(portBytes, off); off += portBytes.byteLength
    outBytes.set(scriptOperatorPayoutSizeBytes, off); off += scriptOperatorPayoutSizeBytes.byteLength
    outBytes.set(scriptOperatorPayoutBytes, off); off += scriptOperatorPayoutBytes.byteLength
    outBytes.set(inputsHashBytes, off); off += inputsHashBytes.byteLength
    outBytes.set(platformNodeIDBytes, off); off += platformNodeIDBytes.byteLength
    outBytes.set(platformP2PPortBytes, off); off += platformP2PPortBytes.byteLength
    outBytes.set(platformHTTPPortBytes, off); off += platformHTTPPortBytes.byteLength
    outBytes.set(payloadSigBytes, off)

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
