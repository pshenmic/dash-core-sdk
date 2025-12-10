import {
  DEFAULT_NLOCK_TIME,
  ExtraPayloadType,
  NLOCK_TIME_BLOCK_BASED_LIMIT,
  TRANSACTION_VERSION,
  TransactionType
} from '../constants.js'
import { TransactionJSON } from '../types.js'
import { Input } from './Input.js'
import { Output } from './Output.js'
import {
  bytesToHex,
  decodeCompactSize,
  doubleSHA256,
  encodeCompactSize,
  getCompactVariableSize,
  hexToBytes
} from '../utils.js'

export class Transaction {
  version: number
  type: TransactionType
  #nLockTime: number
  inputs: Input[]
  outputs: Output[]
  extraPayload?: Uint8Array

  // TODO: payload

  constructor (inputs: Input[], outputs: Output[], nLockTime: number, version: number, type: TransactionType, extraPayload?: Uint8Array) {
    this.version = version ?? TRANSACTION_VERSION
    this.type = type ?? TransactionType.TRANSACTION_NORMAL
    this.#nLockTime = nLockTime ?? DEFAULT_NLOCK_TIME
    this.inputs = inputs
    this.outputs = outputs
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

  // sign(privateKey: Uint8Array): Uint8Array {
  //   const tx = signer.Transaction.fromRaw(this.bytes())
  //
  //   tx.sign(privateKey)
  //
  //   return tx.toBytes(true)
  // }

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

    let extraPayload: Uint8Array | undefined

    if (lockTimePadding + 4 < bytes.length) {
      const extraPayloadSize = decodeCompactSize(lockTimePadding + 4, bytes)

      extraPayload = bytes.slice(lockTimePadding + 4, lockTimePadding + 4 + Number(extraPayloadSize))
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
      extraPayload: this.extraPayload != null ? bytesToHex(this.extraPayload) : null
    }
  }
}
