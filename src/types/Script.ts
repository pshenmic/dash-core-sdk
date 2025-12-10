import { OPCODES, OPCODES_ENUM, DEFAULT_NETWORK, Network, NetworkPrefix } from '../constants.js'
import { bytesToHex, hexToBytes, SHA256RIPEMD160 } from '../utils.js'
import { ScriptChunk } from '../types.js'
import { Base58Check } from '../base58check.js'

export class Script {
  #parsedScript: ScriptChunk[]

  constructor (script?: Script | Uint8Array | string | ScriptChunk[]) {
    if (script == null) {
      this.#parsedScript = []
      return this
    }

    if (script instanceof Script) {
      this.#parsedScript = [...script.parsedScriptChunks]
      return this
    }

    if (ArrayBuffer.isView(script)) {
      return Script.fromBytes(script)
    }

    if (typeof script === 'string') {
      if (/^[0-9A-Fa-f]+$/.test(script)) {
        return Script.fromHex(script)
      } else {
        return Script.fromASM(script)
      }
    }

    if (Array.isArray(script)) {
      this.#parsedScript = [...script]
      return this
    }
  }

  get parsedScriptChunks (): ScriptChunk[] {
    return this.#parsedScript
  }

  set parsedScriptChunks (chunks: ScriptChunk[]) {
    this.#parsedScript = chunks
  }

  addData (opCode: OPCODES_ENUM, data?: Uint8Array): void {
    this.#parsedScript.push({
      opcode: OPCODES[opCode],
      data: data?.buffer as ArrayBuffer
    })
  }

  toAddress (network: Network = DEFAULT_NETWORK): string | undefined {
    if (network > 255) {
      throw new Error('Network prefix cannot be more than 255')
    }

    const cryptoOpCodes = [OPCODES.OP_PUSHBYTES_33, OPCODES.OP_PUSHBYTES_65]

    const cryptoOpcodeIndex = this.parsedScriptChunks.findIndex(chunk => cryptoOpCodes.includes(chunk.opcode))

    if (cryptoOpcodeIndex === -1) {
      return undefined
    }

    const pubKeyHashChunk = this.parsedScriptChunks[cryptoOpcodeIndex]

    if (pubKeyHashChunk === undefined || pubKeyHashChunk?.data === undefined) {
      return undefined
    }

    const pubKeyHash: Uint8Array = SHA256RIPEMD160(new Uint8Array(pubKeyHashChunk.data))

    const pubKeyHashWithPrefix = new Uint8Array(1 + pubKeyHash.byteLength)

    const prefix = (network ?? DEFAULT_NETWORK) === Network.Testnet ? NetworkPrefix.PubkeyPrefixTestnet : NetworkPrefix.PubkeyPrefixMainnet

    pubKeyHashWithPrefix.set(new Uint8Array([prefix]), 0)
    pubKeyHashWithPrefix.set(new Uint8Array(pubKeyHash), 1)

    return Base58Check.encode(pubKeyHashWithPrefix)
  }

  static fromBytes (bytes: Uint8Array): Script {
    // OP_DUP OP_HASH160 OP_PUSHBYTES_20 a3890b802865e1cfeed7653d0fea33831d709b6f OP_EQUALVERIFY OP_CHECKSIG

    // 76a914a3890b802865e1cfeed7653d0fea33831d709b6f88ac
    // stack operator  cryptography  push_data                 data                         Bitwise Logic    cryptography
    // 76                a9              14       a3890b802865e1cfeed7653d0fea33831d709b6f      88              ac

    const chunks: ScriptChunk[] = []

    const dataView = new DataView(bytes.buffer)

    for (let i = 0; i < bytes.length; i++) {
      const opcode = dataView.getUint8(i)

      const chunk: ScriptChunk = {
        opcode
      }

      if (opcode < OPCODES.OP_PUSHDATA1 && opcode > 0) {
        // process OP_PUSHBYTES_X

        chunk.data = dataView.buffer.slice(i + 1, i + 1 + opcode) as ArrayBuffer

        i += opcode
      } else if (opcode === OPCODES.OP_PUSHDATA1) {
        const bytesForPush = dataView.getUint8(i + 1)

        chunk.data = dataView.buffer.slice(i + 1, i + 1 + bytesForPush) as ArrayBuffer
        i += bytesForPush
      } else if (opcode === OPCODES.OP_PUSHDATA2) {
        const bytesForPush = dataView.getUint16(i + 1, true)

        chunk.data = dataView.buffer.slice(i + 3, i + 3 + bytesForPush) as ArrayBuffer
        i += bytesForPush + 2
      } else if (opcode === OPCODES.OP_PUSHDATA4) {
        const bytesForPush = dataView.getUint32(i + 1, true)

        chunk.data = dataView.buffer.slice(i + 5, i + 5 + bytesForPush) as ArrayBuffer
        i += bytesForPush + 4
      }

      chunks.push(chunk)
    }

    return new Script(chunks)
  }

  static fromHex (hex: string): Script {
    return this.fromBytes(hexToBytes(hex))
  }

  static fromASM (asm: string): Script {
    const scriptChunks: ScriptChunk[] = []

    const chunks: string[] = asm.split(' ')

    for (let i = 0; i < chunks.length; i++) {
      const opcode = OPCODES[chunks[i]]

      if (opcode === undefined) {
        throw new Error('Cannot parse asm string')
      }

      if (opcode > 0 && opcode <= OPCODES.OP_PUSHDATA4) {
        scriptChunks.push({
          opcode,
          data: hexToBytes(chunks[i + 1]).buffer as ArrayBuffer
        })

        i++
      } else {
        scriptChunks.push({
          opcode
        })
      }
    }

    return new Script(scriptChunks)
  }

  ASMString (): string {
    const out: string[] = []

    for (let i = 0; i < this.#parsedScript.length; i++) {
      const chunk = this.#parsedScript[i]

      const opcodeHumanReadable = Object.keys(OPCODES)[Object.values(OPCODES).indexOf(chunk.opcode)]
      const dataHumanReadable = (chunk.data != null) ? bytesToHex(new Uint8Array(chunk.data)) : undefined

      out.push(opcodeHumanReadable)

      if (dataHumanReadable != null) {
        out.push(dataHumanReadable)
      }
    }

    return out.join(' ')
  }

  bytes (): Uint8Array<ArrayBufferLike> {
    let out: Uint8Array = new Uint8Array<ArrayBuffer>(new ArrayBuffer(0))

    for (let i = 0; i < this.#parsedScript.length; i++) {
      const chunk = this.#parsedScript[i]

      const { data } = chunk

      const dataLength = data?.byteLength ?? 0

      const tmpBytes = new Uint8Array(1 + dataLength + out.byteLength)

      tmpBytes.set(out, 0)

      tmpBytes.set([chunk.opcode], out.byteLength)

      if (chunk.data != null) {
        tmpBytes.set(new Uint8Array(chunk.data), out.byteLength + 1)
      }

      out = tmpBytes
    }

    return out
  }

  hex (): string {
    const bytes = this.bytes()

    return bytesToHex(bytes)
  }
}
