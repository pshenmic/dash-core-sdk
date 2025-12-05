import {Script} from "./Script";
import {
  bytesToHex,
  decodeCompactSize,
  encodeCompactSize,
  getCompactVariableSize,
  hexToBytes,
  SHA256RIPEMD160
} from "../utils";
import {DEFAULT_NETWORK, Network, NetworkPrefix, OPCODES} from "../constants";
import {Base58Check} from "../base58check";

export class Input {
  txId: Uint8Array
  vout: number
  scriptSig: Script
  sequence: number

  constructor(txId: string | Uint8Array, vout: number, scriptSig: Script, sequence: number) {
    if (typeof txId === "string") {
      this.txId = hexToBytes(txId)
    } else if (ArrayBuffer.isView(txId)) {
      this.txId = txId
    } else {
      this.txId = new Uint8Array(32)
    }

    this.vout = vout
    this.scriptSig = scriptSig
    this.sequence = sequence
  }

  getTxIdHex(): string {
    return bytesToHex(this.txId.toReversed())
  }

  bytes(): Uint8Array {
    const txIdBytes = this.txId
    const voutBytes = new DataView(new ArrayBuffer(4))
    const scriptSigBytes = this.scriptSig.bytes()
    const scriptSigSizeBytes = encodeCompactSize(scriptSigBytes.byteLength)
    const sequenceBytes = new DataView(new ArrayBuffer(4))

    voutBytes.setUint32(0, this.vout, true)
    sequenceBytes.setUint32(0, this.sequence, true)

    const bytes = new Uint8Array(txIdBytes.byteLength + voutBytes.byteLength + scriptSigBytes.byteLength + scriptSigSizeBytes.byteLength + sequenceBytes.byteLength)

    bytes.set(txIdBytes, 0)
    bytes.set(new Uint8Array(voutBytes.buffer), txIdBytes.byteLength)
    bytes.set(scriptSigSizeBytes, txIdBytes.byteLength + voutBytes.byteLength)
    bytes.set(scriptSigBytes, txIdBytes.byteLength + voutBytes.byteLength + scriptSigSizeBytes.byteLength)
    bytes.set(new Uint8Array(sequenceBytes.buffer), txIdBytes.byteLength + voutBytes.byteLength + scriptSigBytes.byteLength + scriptSigSizeBytes.byteLength)

    return bytes
  }

  static fromBytes(bytes: Uint8Array): Input {
    const txIdBytes = bytes.slice(0, 32)

    const voutBytes = new DataView(bytes.slice(32, 36).buffer)

    const scriptSigSize = decodeCompactSize(36, bytes)
    const scriptBytesSize = getCompactVariableSize(scriptSigSize)

    const scriptSigBytes = bytes.slice(36 + scriptBytesSize, 36 + scriptBytesSize + Number(scriptSigSize))

    const sequenceBytes = new DataView(bytes.slice(36 + scriptBytesSize + Number(scriptSigSize), 36 + scriptBytesSize + Number(scriptSigSize) + 4).buffer)

    return new Input(
      txIdBytes,
      voutBytes.getUint32(0, true),
      Script.fromBytes(scriptSigBytes),
      sequenceBytes.getUint32(0, true)
    )
  }

  hex() {
    return bytesToHex(this.bytes())
  }

  static fromHex(hex: string) {
    return Input.fromBytes(hexToBytes(hex))
  }

  getAddress(network: Network = DEFAULT_NETWORK): string | undefined {
    if (network > 255) {
      throw new Error("Network prefix cannot be more than 255")
    }

    const cryptoOpCodes = [OPCODES.OP_PUSHBYTES_33, OPCODES.OP_PUSHBYTES_65]

    const cryptoOpcodeIndex = this.scriptSig.parsedScriptChunks.findIndex(chunk => cryptoOpCodes.includes(chunk.opcode))

    if (cryptoOpcodeIndex === -1) {
      return undefined
    }

    const pubKeyHashChunk = this.scriptSig.parsedScriptChunks[cryptoOpcodeIndex]

    if (pubKeyHashChunk === undefined || pubKeyHashChunk?.data === undefined) {
      return undefined
    }

    let pubKeyHash: Uint8Array = SHA256RIPEMD160(new Uint8Array(pubKeyHashChunk.data))

    const pubKeyHashWithPrefix = new Uint8Array(1 + pubKeyHash.byteLength)

    const prefix = (network ?? DEFAULT_NETWORK) === Network.Testnet ? NetworkPrefix.PubkeyPrefixTestnet : NetworkPrefix.PubkeyPrefixMainnet

    pubKeyHashWithPrefix.set(new Uint8Array([prefix]), 0)
    pubKeyHashWithPrefix.set(new Uint8Array(pubKeyHash), 1)

    return Base58Check.encode(pubKeyHashWithPrefix)
  }
}