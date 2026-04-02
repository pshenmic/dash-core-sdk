import { Script } from './Script.js'
import {
  addressToPublicKeyHash,
  bytesToHex,
  decodeCompactSize,
  encodeCompactSize,
  getCompactVariableSize,
  hexToBytes
} from '../utils.js'
import { DEFAULT_NETWORK } from '../constants.js'
import { NetworkLike, OutputJSON } from '../types.js'

export class Output {
  satoshis: bigint
  script: Script

  constructor (satoshis: bigint, script?: Script) {
    this.satoshis = satoshis
    this.script = script ?? new Script()
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

  static createP2PKH (satoshis: bigint, address: string): Output {
    const output = new Output(satoshis)

    output.generateP2PKH(address)

    return output
  }

  static createAssetLockBurn (satoshis: bigint): Output {
    const script = new Script()

    script.pushOpCode('OP_RETURN')
    script.pushOpCode('OP_0')

    return new Output(satoshis, script)
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

  generateP2PKH (address: string): void {
    const script = new Script()

    script.pushOpCode('OP_DUP')
    script.pushOpCode('OP_HASH160')
    script.pushOpCode('OP_PUSHBYTES_20', addressToPublicKeyHash(address))
    script.pushOpCode('OP_EQUALVERIFY')
    script.pushOpCode('OP_CHECKSIG')

    this.script = script
  }

  getAddress (network: NetworkLike = DEFAULT_NETWORK): string | undefined {
    return this.script.getAddress(network)
  }

  toJSON (): OutputJSON {
    return {
      satoshis: String(this.satoshis),
      script: this.script.ASMString()
    }
  }
}
