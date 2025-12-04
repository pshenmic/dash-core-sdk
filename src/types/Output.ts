import {Script} from "./script";
import {bytesToHex, decodeCompactSize, encodeCompactSize, getCompactVariableSize, hexToBytes} from "../utils";
import {DEFAULT_NETWORK, Network, NetworkPrefix, OPCODES} from "../constants";
import {Base58Check} from "../base58check";

export class Output {
  satoshis: bigint
  script: Script

  constructor(satoshis: bigint, script: Script) {
    this.satoshis = satoshis
    this.script = script
  }

  static fromBytes(bytes: Uint8Array): Output {
    const properties = new DataView(bytes.buffer)

    const satoshis = properties.getBigUint64(0, true)

    const scriptSize = decodeCompactSize(8, bytes)

    const scriptPadding = 8 + getCompactVariableSize(scriptSize)

    const script = new Script(new Uint8Array(properties.buffer.slice(scriptPadding, scriptPadding + Number(scriptSize))))

    return new Output(satoshis, script)
  }

  static fromHex(hex: string): Output {
    return Output.fromBytes(hexToBytes(hex))
  }

  bytes(): Uint8Array {
    const scriptBytes = this.script.bytes()
    const scriptSize = encodeCompactSize(scriptBytes.byteLength)

    const dataView = new DataView(new ArrayBuffer(8))

    dataView.setBigUint64(0, this.satoshis, true)

    const bytes = new Uint8Array(dataView.byteLength + scriptBytes.byteLength + getCompactVariableSize(scriptBytes.byteLength))

    bytes.set(new Uint8Array(dataView.buffer), 0)
    bytes.set(scriptSize, dataView.buffer.byteLength)
    bytes.set(scriptBytes, dataView.byteLength+scriptSize.byteLength)

    return bytes;
  }

  hex(): string {
    return bytesToHex(this.bytes())
  }

  getAddress(network: Network = DEFAULT_NETWORK): string | undefined {
    if (network > 255) {
      throw new Error("Network prefix cannot be more than 255")
    }

    // TODO: add other codes
    const cryptoOpCodes = [OPCODES.OP_HASH160]

    const cryptoOpcodeIndex = this.script.parsedScriptChunks.findIndex(chunk => cryptoOpCodes.includes(chunk.opcode))

    if (cryptoOpcodeIndex === -1) {
      return undefined
    }

    const pubKeyHashChunk = this.script.parsedScriptChunks[cryptoOpcodeIndex + 1]

    if (pubKeyHashChunk === undefined || pubKeyHashChunk?.data === undefined) {
      return undefined
    }

    const pubKeyHash = pubKeyHashChunk.data

    const pubKeyHashWithPrefix = new Uint8Array(1 + pubKeyHash.byteLength)

    const prefix = (network ?? DEFAULT_NETWORK) === Network.Testnet ? NetworkPrefix.ScriptPrefixTestnet : NetworkPrefix.ScriptPrefixMainnet

    pubKeyHashWithPrefix.set(new Uint8Array([prefix]), 0)
    pubKeyHashWithPrefix.set(new Uint8Array(pubKeyHash), 1)

    return Base58Check.encode(pubKeyHashWithPrefix)
  }
}