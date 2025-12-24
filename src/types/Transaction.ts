import {
  CHANGE_OUTPUT_MAX_SIZE,
  DEFAULT_NLOCK_TIME,
  ExtraPayloadType, FEE_PER_BYTE, MIN_FEE_RELAY,
  NLOCK_TIME_BLOCK_BASED_LIMIT, OPCODES_ENUM, SIGHASH_ALL, SIGNED_INPUT_MAX_SIZE,
  TRANSACTION_VERSION,
  TransactionType
} from '../constants.js'
import { ExtraPayload, TransactionJSON } from '../types.js'
import { Input } from './Input.js'
import { Output } from './Output.js'
import {
  addressToPublicKeyHash,
  bytesToHex,
  decodeCompactSize,
  doubleSHA256,
  encodeCompactSize,
  getCompactVariableSize,
  hexToBytes
} from '../utils.js'
import { PrivateKey } from './PrivateKey.js'
import { secp256k1 } from '@noble/curves/secp256k1.js'
import { Script } from './Script.js'
import { ProRegTX, ProUpServTx } from './ExtraPayload/index.js'
import { ProUpRevTx } from './ExtraPayload/ProUpRevTx.js'

export class Transaction {
  version: number
  type: TransactionType
  #nLockTime: number
  inputs: Input[]
  outputs: Output[]
  extraPayload?: ExtraPayload

  constructor (inputs?: Input[], outputs?: Output[], nLockTime?: number, version?: number, type?: TransactionType, extraPayload?: ExtraPayload) {
    this.version = version ?? TRANSACTION_VERSION
    this.type = type ?? TransactionType.TRANSACTION_NORMAL
    this.#nLockTime = nLockTime ?? DEFAULT_NLOCK_TIME
    this.inputs = inputs ?? []
    this.outputs = outputs ?? []
    this.extraPayload = extraPayload
  }

  get nLockTime (): Date | number {
    if (this.#nLockTime < NLOCK_TIME_BLOCK_BASED_LIMIT) {
      return this.#nLockTime
    } else {
      return !isNaN(this.#nLockTime) ? new Date(this.#nLockTime) : this.#nLockTime
    }
  }

  set nLockTime (nLockTime: number | Date) {
    if (nLockTime instanceof Date) {
      this.#nLockTime = nLockTime.getTime()
      return
    }

    // check for js
    if (typeof (nLockTime as any) !== 'number') {
      throw new Error('Invalid nLock time')
    }

    if (nLockTime < 0) {
      throw new Error('nLockTime must be greater than 0')
    }

    this.#nLockTime = nLockTime
  }

  addInput (inputs: Input): void {
    this.inputs.push(inputs)
  }

  addOutput (output: Output): void {
    this.outputs.push(output)
  }

  getOutputAmount (): bigint {
    return this.outputs.reduce((acc, curr) => {
      return acc + curr.satoshis
    }, BigInt(0))
  }

  hash (): string {
    return bytesToHex(doubleSHA256(this.bytes()).toReversed())
  }

  getExtraPayloadType (): keyof typeof ExtraPayloadType | undefined {
    switch (this.type) {
      case TransactionType.TRANSACTION_PROVIDER_REGISTER:
        return 'ProRegTx'
      case TransactionType.TRANSACTION_PROVIDER_UPDATE_SERVICE:
        return 'ProUpServTx'
      case TransactionType.TRANSACTION_PROVIDER_UPDATE_REGISTRAR:
        return 'ProUpRegTx'
      case TransactionType.TRANSACTION_PROVIDER_UPDATE_REVOKE:
        return 'ProUpRevTx'
      case TransactionType.TRANSACTION_COINBASE:
        return 'CbTx'
      case TransactionType.TRANSACTION_QUORUM_COMMITMENT:
        return 'QcTx'
      case TransactionType.TRANSACTION_MASTERNODE_HARD_FORK_SIGNAL:
        return 'MnHfTx'
      case TransactionType.TRANSACTION_ASSET_LOCK:
        return 'AssetLockTx'
      case TransactionType.TRANSACTION_ASSET_UNLOCK:
        return 'AssetUnlockTx'
    }

    return undefined
  }

  #signInput (privateKey: PrivateKey, inputIndex: number): void {
    if (this.inputs.length < inputIndex) {
      throw new Error(`input with not found (index: ${inputIndex})`)
    }
    if (inputIndex < 0) {
      throw new Error('inputIndex must be greater than 0')
    }

    const publicKey = privateKey.getPublicKey()

    // clone inputs
    const savedInputs = this.inputs.map(input => Input.fromBytes(input.bytes()))

    for (let i = 0; i < this.inputs.length; i++) {
      if (i !== inputIndex) {
        this.inputs[i].scriptSig = new Script()
      }
    }

    const txBytes = this.bytes()
    const sighashBytes = new Uint8Array(txBytes.length + 4)
    sighashBytes.set(txBytes, 0)

    // push value via link to sighashBytes
    const sighashView = new DataView(sighashBytes.buffer, txBytes.length, 4)
    sighashView.setUint32(0, SIGHASH_ALL, true)

    const derSignature = secp256k1.sign(doubleSHA256(sighashBytes), privateKey.key, {
      format: 'der',
      prehash: false,
      lowS: true
    })

    const signatureWithSighash = new Uint8Array(derSignature.length + 1)
    signatureWithSighash.set(derSignature, 0)
    signatureWithSighash[derSignature.length] = SIGHASH_ALL

    const inputScript = new Script()

    let sigOpcode: OPCODES_ENUM

    if (signatureWithSighash.byteLength === 71) {
      sigOpcode = 'OP_PUSHBYTES_71'
    } else if (signatureWithSighash.byteLength === 72) {
      sigOpcode = 'OP_PUSHBYTES_72'
    } else if (signatureWithSighash.byteLength === 73) {
      sigOpcode = 'OP_PUSHBYTES_73'
    } else {
      throw new Error('Invalid signature size')
    }

    inputScript.pushOpCode(sigOpcode, signatureWithSighash)
    inputScript.pushOpCode('OP_PUSHBYTES_33', publicKey.inner)

    this.inputs = savedInputs

    this.inputs[inputIndex].scriptSig = inputScript
  }

  // TODO: MultiSig
  sign (privateKey: PrivateKey): void {
    for (let i = 0; i < this.inputs.length; i++) {
      this.#signInput(privateKey, i)
    }
  }

  generateChange (address: string, inputAmount: bigint): void {
    if (this.inputs.length === 0) {
      throw new Error('Before call generateChange you must set all inputs')
    }
    if (this.outputs.length === 0) {
      throw new Error('Before call generateChange you must set all outputs')
    }

    const signedInputsSize = this.inputs.reduce((acc) => acc + BigInt(SIGNED_INPUT_MAX_SIZE), BigInt(0))

    const outputAmount = this.outputs.reduce((acc, curr) => acc + curr.satoshis, 0n)

    if (inputAmount < outputAmount) {
      throw new Error('Inputs amount lower than output amount')
    }

    const dummyTx = Transaction.fromBytes(this.bytes())
    dummyTx.inputs = []

    const txBytesLength = BigInt(dummyTx.bytes().byteLength) + signedInputsSize

    const outputsWithChangePrediction = outputAmount + BigInt(CHANGE_OUTPUT_MAX_SIZE) + txBytesLength
    let changeAmount = inputAmount - outputsWithChangePrediction * BigInt(FEE_PER_BYTE)

    if (inputAmount === outputAmount + changeAmount) {
      return
    }

    const outputScript = new Script()

    outputScript.pushOpCode('OP_DUP')
    outputScript.pushOpCode('OP_HASH160')
    outputScript.pushOpCode('OP_PUSHBYTES_20', addressToPublicKeyHash(address))
    outputScript.pushOpCode('OP_EQUALVERIFY')
    outputScript.pushOpCode('OP_CHECKSIG')

    if (changeAmount < MIN_FEE_RELAY) {
      changeAmount = BigInt(MIN_FEE_RELAY)
    }

    const changeOutput = new Output(changeAmount, outputScript)

    if (inputAmount < outputAmount + BigInt(this.bytes().byteLength + changeOutput.bytes().byteLength + getCompactVariableSize(this.outputs.length + 1))) {
      return
    }

    this.outputs.push(changeOutput)
  }

  bytes (): Uint8Array {
    // 4 bytes version & type packed
    // varint input count
    // inputs
    // varint output count
    // outputs
    // nLockTime

    const versionWithTypeView = new DataView(new ArrayBuffer(4))
    versionWithTypeView.setInt32(0, this.version | (this.type << 16), true)

    const inputCount = encodeCompactSize(this.inputs.length)
    const inputs = this.inputs.map(input => input.bytes())

    const outputCount = encodeCompactSize(this.outputs.length)
    const outputs = this.outputs.map(output => output.bytes())

    const inputsSize = inputs.reduce((acc, curr) => acc + curr.byteLength, 0)
    const outputsSize = outputs.reduce((acc, curr) => acc + curr.length, 0)

    const inputsBytes = inputs
      .reduce(
        (acc, curr, currentIndex): Uint8Array => {
          const previousBytesSize = inputs.slice(0, currentIndex).reduce((acc, curr) => acc + curr.byteLength, 0)

          acc.set(curr, previousBytesSize)

          return acc
        },
        new Uint8Array(inputsSize)
      )

    const outputsBytes = outputs
      .reduce(
        (acc, curr, currentIndex): Uint8Array => {
          const previousBytesSize = outputs.slice(0, currentIndex).reduce((acc, curr) => acc + curr.byteLength, 0)

          acc.set(curr, previousBytesSize)

          return acc
        },
        new Uint8Array(outputsSize)
      )

    const lockTimeView = new DataView(new ArrayBuffer(4))
    lockTimeView.setUint32(0, this.#nLockTime, true)

    const out = new Uint8Array(versionWithTypeView.byteLength + inputCount.byteLength + inputsSize + outputCount.byteLength + outputsSize + lockTimeView.byteLength)

    out.set(new Uint8Array(versionWithTypeView.buffer), 0)
    out.set(inputCount, 4)
    out.set(inputsBytes, 4 + inputCount.byteLength)
    out.set(outputCount, 4 + inputCount.byteLength + inputsSize)
    out.set(outputsBytes, 4 + inputCount.byteLength + inputsSize + outputCount.byteLength)
    out.set(new Uint8Array(lockTimeView.buffer), 4 + inputCount.byteLength + inputsSize + outputCount.byteLength + outputsSize)

    return out
  }

  hex (): string {
    return bytesToHex(this.bytes())
  }

  static fromBytes (bytes: Uint8Array): Transaction {
    // 4 bytes version & type packed
    // varint input count
    // inputs
    // varint output count
    // outputs
    // nLockTime

    const dataView = new DataView(bytes.buffer)

    const versionWithType = dataView.getInt32(0, true)
    const version = versionWithType & 0xffff
    const type = (versionWithType >> 16) & 0xffff

    const inputCount = decodeCompactSize(4, bytes)
    const inputCountSize = getCompactVariableSize(inputCount)

    const inputsPadding = 4 + inputCountSize

    const inputs: Input[] = []

    for (let i = BigInt(0); i < inputCount; i++) {
      const offset = inputs.reduce((acc, curr) => acc + curr.bytes().byteLength, 0)

      const input = Input.fromBytes(bytes.slice(inputsPadding + offset))

      inputs.push(input)
    }

    const outputCountPadding = inputs.reduce((acc, curr) => acc + curr.bytes().byteLength, inputsPadding)

    const outputCount = decodeCompactSize(outputCountPadding, bytes)
    const outputCountSize = getCompactVariableSize(outputCount)

    const outputsPadding = outputCountPadding + outputCountSize

    const outputs: Output[] = []

    for (let i = BigInt(0); i < outputCount; i++) {
      const offset = outputs.reduce((acc, curr) => acc + curr.bytes().byteLength, 0)

      const output = Output.fromBytes(bytes.slice(outputsPadding + offset))

      outputs.push(output)
    }

    const lockTimePadding = outputCountPadding + outputCountSize + outputs.reduce((acc, curr) => acc + curr.bytes().byteLength, 0)

    const nLockTime = dataView.getUint32(lockTimePadding, true)

    let extraPayload: ExtraPayload | undefined

    if (lockTimePadding + 4 < bytes.length) {
      const extraPayloadSize = decodeCompactSize(lockTimePadding + 4, bytes)

      let extraPayloadHandler: Function

      switch (type) {
        case TransactionType.TRANSACTION_PROVIDER_REGISTER:
          extraPayloadHandler = ProRegTX.fromBytes
          break
        case TransactionType.TRANSACTION_PROVIDER_UPDATE_SERVICE:
          extraPayloadHandler = ProUpServTx.fromBytes
          break
        case TransactionType.TRANSACTION_PROVIDER_UPDATE_REGISTRAR:
          extraPayloadHandler = ProUpRevTx.fromBytes
          break
        case TransactionType.TRANSACTION_PROVIDER_UPDATE_REVOKE:
          extraPayloadHandler = ProUpRevTx.fromBytes
          break
        default:
          throw new Error(`Unsupported extra payload type ${type}`)
      }

      extraPayload = extraPayloadHandler(bytes.slice(lockTimePadding + 4 + getCompactVariableSize(extraPayloadSize), lockTimePadding + 4 + getCompactVariableSize(extraPayloadSize) + Number(extraPayloadSize)))
    }

    return new Transaction(inputs, outputs, nLockTime, version, type, extraPayload)
  }

  static fromHex (hex: string): Transaction {
    return Transaction.fromBytes(hexToBytes(hex))
  }

  toJSON (): TransactionJSON {
    return {
      version: this.version,
      type: this.type,
      nLockTime: this.#nLockTime,
      outputs: this.outputs.map(output => output.toJSON()),
      inputs: this.inputs.map(input => input.toJSON()),
      extraPayload: this.extraPayload?.toJSON() ?? null
    }
  }
}
