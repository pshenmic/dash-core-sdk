import { Script } from './Script.js'
import { bytesToHex, decodeCompactSize, encodeCompactSize, getCompactVariableSize, hexToBytes } from '../utils.js'
import { DEFAULT_NETWORK, Network, NetworkPrefix, OPCODES } from '../constants.js'
import { Base58Check } from '../base58check.js'
import { OutputJSON } from '../types.js'
import { Script } from './Script'
import {
  bytesToHex,
  decodeCompactSize,
  encodeCompactSize,
  getCompactVariableSize,
  hexToBytes,
  networkValueToEnumValue
} from '../utils'
import { DEFAULT_NETWORK, OPCODES } from '../constants'
import { NetworkLike, OutputJSON } from '../types'

export class Output {
  satoshis: bigint
  script: Script

  constructor (satoshis: bigint, script: Script) {
    this.satoshis = satoshis
    this.script = script
  }

  static fromBytes (bytes: Uint8Array): Output {
    const properties = new DataView(bytes.buffer)

    const satoshis = properties.getBigUint64(0, true)

    const scriptSize = decodeCompactSize(8, bytes)

    const scriptPadding = 8 + getCompactVariableSize(scriptSize)

    const script = new Script(new Uint8Array(properties.buffer.slice(scriptPadding, scriptPadding + Number(scriptSize))))

    return new Output(satoshis, script)
  }

  static fromHex (hex: string): Output {
    return Output.fromBytes(hexToBytes(hex))
  }

  bytes (): Uint8Array {
    const scriptBytes = this.script.bytes()
    const scriptSize = encodeCompactSize(scriptBytes.byteLength)

    const dataView = new DataView(new ArrayBuffer(8))

    dataView.setBigUint64(0, this.satoshis, true)

    const bytes = new Uint8Array(dataView.byteLength + scriptBytes.byteLength + getCompactVariableSize(scriptBytes.byteLength))

    bytes.set(new Uint8Array(dataView.buffer), 0)
    bytes.set(scriptSize, dataView.buffer.byteLength)
    bytes.set(scriptBytes, dataView.byteLength + scriptSize.byteLength)

    return bytes
  }

  hex (): string {
    return bytesToHex(this.bytes())
  }

  getAddress (network: NetworkLike = DEFAULT_NETWORK): string | undefined {
    const normalNetwork = networkValueToEnumValue(network)

    if (normalNetwork > 255) {
      throw new Error('Network prefix cannot be more than 255')
    }

    // TODO: add other codes
    const cryptoOpCodes = [OPCODES.OP_HASH160]

    const cryptoOpcodeIndex = this.script.parsedScriptChunks.findIndex(chunk => cryptoOpCodes.includes(chunk.opcode))

    if (cryptoOpcodeIndex === -1) {
      return undefined
    }
  }

  toJSON (): OutputJSON {
    return {
      satoshis: String(this.satoshis),
      script: this.script.ASMString()
    }
  }
}
