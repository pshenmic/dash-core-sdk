import {
  ASSET_UNLOCK_PAYLOAD_SIZE,
  ASSET_UNLOCK_QUORUM_INFO_SIZE,
  ASSET_UNLOCK_STABLE_TXID_VERSION,
  CHANGE_OUTPUT_MAX_SIZE,
  DEFAULT_NLOCK_TIME,
  ExtraPayloadType, FEE_PER_BYTE, MIN_FEE_RELAY,
  NLOCK_TIME_BLOCK_BASED_LIMIT, OPCODES_ENUM, P2PKH_SCRIPT_SIG_MAX_SIZE, PROTX_VERSION_EXT_ADDR, SHARED_MN_DISSOLVE_PREFIX, SHARED_MN_REG_CONSENT_PREFIX,
  SIGHASH_ALL, SIGNED_INPUT_MAX_SIZE,
  SPECIAL_TRANSACTION_VERSION,
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
import { ProRegTX } from './ExtraPayload/ProRegTX.js'
import { ProUpServTx } from './ExtraPayload/ProUpServTx.js'
import { ProUpRegTx } from './ExtraPayload/ProUpRegTx.js'
import { ProUpRevTx } from './ExtraPayload/ProUpRevTx.js'
import { CbTx } from './ExtraPayload/CbTx.js'
import { QcTx } from './ExtraPayload/QcTx.js'
import { MnHfTx } from './ExtraPayload/MnHfTx.js'
import { AssetLockTx } from './ExtraPayload/AssetLockTx.js'
import { AssetUnlockTx } from './ExtraPayload/AssetUnlockTx.js'
import { ProDisTx } from './ExtraPayload/ProDisTx.js'
import { ProUpShareTx } from './ExtraPayload/ProUpShareTx.js'
import { ProUpSharedRegTx } from './ExtraPayload/ProUpSharedRegTx.js'
import { OutPoint } from './OutPoint.js'
import { RawExtraPayload } from './ExtraPayload/RawExtraPayload.js'
import { ExtNetInfo } from './ExtNetInfo.js'

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

  /**
   * Transaction id
   *
   * For asset unlocks with payload version 2+ the quorum signing info (requestedHeight, quorumHash, quorumSig)
   * is excluded from the hash, so every re-signed instance of one withdrawal shares one txid.
   * The payload is serialized last, so that info occupies the trailing bytes of the transaction.
   */
  hash (): string {
    const bytes = this.bytes()

    if (this.isAssetUnlockWithStableTxid()) {
      bytes.fill(0, bytes.byteLength - ASSET_UNLOCK_QUORUM_INFO_SIZE)
    }

    return bytesToHex(doubleSHA256(bytes).toReversed())
  }

  /**
   * Hash of the full serialization
   *
   * Equal to hash() for every transaction except version 2+ asset unlocks,
   * where it distinguishes re-signed instances of one withdrawal
   */
  instanceHash (): string {
    return bytesToHex(doubleSHA256(this.bytes()).toReversed())
  }

  /**
   * Whether this is a shared masternode registration (ProRegTx version 3+ with a non-empty share table)
   */
  isSharedRegistration (): boolean {
    return this.extraPayload instanceof ProRegTX &&
      this.extraPayload.version >= PROTX_VERSION_EXT_ADDR &&
      (this.extraPayload.shares?.length ?? 0) > 0
  }

  /**
   * Digest every share owner signs to consent to a shared masternode registration (Dash Core CProRegTx::MakeSharedRegConsentHash)
   *
   * Binds the funding inputs and their sequences, all outputs, the share table, the penalty terms and the registrar configuration
   */
  consentHash (): string {
    if (!this.isSharedRegistration()) {
      throw new Error('Consent hash is only defined for a shared ProRegTx')
    }

    const payload = this.extraPayload as ProRegTX
    const shares = payload.shares ?? []

    const prefixBytes = new TextEncoder().encode(SHARED_MN_REG_CONSENT_PREFIX)
    const prefixSizeBytes = encodeCompactSize(prefixBytes.byteLength)

    const payloadVersionBytes = new Uint8Array(2)
    new DataView(payloadVersionBytes.buffer, payloadVersionBytes.byteOffset, payloadVersionBytes.byteLength).setUint16(0, payload.version, true)

    const versionWithTypeView = new DataView(new ArrayBuffer(4))
    versionWithTypeView.setInt32(0, this.version | (this.type << 16), true)

    const lockTimeView = new DataView(new ArrayBuffer(4))
    lockTimeView.setUint32(0, this.#nLockTime, true)

    const inputsHashBytes = doubleSHA256(this.#concatChunks(this.inputs.map(input => new OutPoint(input.txId, input.vOut).bytes())))
    const sequencesBytes = this.#sequencesBytes()
    const outputsHashBytes = doubleSHA256(this.#concatChunks(this.outputs.map(output => output.bytes())))

    const typeBytes = new Uint8Array(2)
    const modeBytes = new Uint8Array(2)

    new DataView(typeBytes.buffer, typeBytes.byteOffset, typeBytes.byteLength).setUint16(0, payload.type, true)
    new DataView(modeBytes.buffer, modeBytes.byteOffset, modeBytes.byteLength).setUint16(0, payload.mode, true)

    const netInfoBytes = (payload.netInfo ?? new ExtNetInfo()).bytes()

    let platformNodeIDBytes: Uint8Array<ArrayBufferLike> = new Uint8Array(0)

    // Per Dash Core, platform node id is covered iff nType == MnType::Evo (1).
    if (payload.type === 1) {
      platformNodeIDBytes = hexToBytes(payload.platformNodeID ?? '').toReversed()
    }

    const keyIdVotingBytes = hexToBytes(payload.keyIdVoting)
    const pubKeyOperatorBytes = hexToBytes(payload.pubKeyOperator)

    const operatorRewardBytes = new Uint8Array(2)
    new DataView(operatorRewardBytes.buffer, operatorRewardBytes.byteOffset, operatorRewardBytes.byteLength).setUint16(0, payload.operatorReward, true)

    const sharesBytes = this.#concatChunks([new Uint8Array([shares.length]), ...shares.map(share => share.bytes())])

    const earlyBytes = new Uint8Array(12)
    const earlyView = new DataView(earlyBytes.buffer)
    earlyView.setUint32(0, payload.earlyPeriodBlocks ?? 0, true)
    earlyView.setBigInt64(4, payload.earlyPenalty ?? 0n, true)

    const outBytes = new Uint8Array(
      prefixSizeBytes.byteLength +
      prefixBytes.byteLength +
      payloadVersionBytes.byteLength +
      versionWithTypeView.byteLength +
      lockTimeView.byteLength +
      inputsHashBytes.byteLength +
      sequencesBytes.byteLength +
      outputsHashBytes.byteLength +
      typeBytes.byteLength +
      modeBytes.byteLength +
      netInfoBytes.byteLength +
      platformNodeIDBytes.byteLength +
      keyIdVotingBytes.byteLength +
      pubKeyOperatorBytes.byteLength +
      operatorRewardBytes.byteLength +
      sharesBytes.byteLength +
      earlyBytes.byteLength
    )

    let off = 0
    outBytes.set(prefixSizeBytes, off); off += prefixSizeBytes.byteLength
    outBytes.set(prefixBytes, off); off += prefixBytes.byteLength
    outBytes.set(payloadVersionBytes, off); off += payloadVersionBytes.byteLength
    outBytes.set(new Uint8Array(versionWithTypeView.buffer), off); off += versionWithTypeView.byteLength
    outBytes.set(new Uint8Array(lockTimeView.buffer), off); off += lockTimeView.byteLength
    outBytes.set(inputsHashBytes, off); off += inputsHashBytes.byteLength
    outBytes.set(sequencesBytes, off); off += sequencesBytes.byteLength
    outBytes.set(outputsHashBytes, off); off += outputsHashBytes.byteLength
    outBytes.set(typeBytes, off); off += typeBytes.byteLength
    outBytes.set(modeBytes, off); off += modeBytes.byteLength
    outBytes.set(netInfoBytes, off); off += netInfoBytes.byteLength
    outBytes.set(platformNodeIDBytes, off); off += platformNodeIDBytes.byteLength
    outBytes.set(keyIdVotingBytes, off); off += keyIdVotingBytes.byteLength
    outBytes.set(pubKeyOperatorBytes, off); off += pubKeyOperatorBytes.byteLength
    outBytes.set(operatorRewardBytes, off); off += operatorRewardBytes.byteLength
    outBytes.set(sharesBytes, off); off += sharesBytes.byteLength
    outBytes.set(earlyBytes, off)

    return bytesToHex(doubleSHA256(outBytes).toReversed())
  }

  /**
   * Digest the ProDisTx signatures sign (Dash Core CProDisTx::MakeSignHash)
   *
   * Commits to the actual inputs and outputs and to the signature count, which selects the dissolution mode
   */
  dissolveSignHash (): string {
    if (!(this.extraPayload instanceof ProDisTx)) {
      throw new Error('Dissolve sign hash is only defined for a ProDisTx')
    }

    const payload = this.extraPayload

    const prefixBytes = new TextEncoder().encode(SHARED_MN_DISSOLVE_PREFIX)
    const prefixSizeBytes = encodeCompactSize(prefixBytes.byteLength)

    const payloadVersionBytes = new Uint8Array(2)
    new DataView(payloadVersionBytes.buffer, payloadVersionBytes.byteOffset, payloadVersionBytes.byteLength).setUint16(0, payload.version, true)

    const versionWithTypeView = new DataView(new ArrayBuffer(4))
    versionWithTypeView.setInt32(0, this.version | (this.type << 16), true)

    const lockTimeView = new DataView(new ArrayBuffer(4))
    lockTimeView.setUint32(0, this.#nLockTime, true)

    const prevoutsBytes = this.#concatChunks(this.inputs.map(input => new OutPoint(input.txId, input.vOut).bytes()))
    const sequencesBytes = this.#sequencesBytes()
    const outputsBytes = this.#concatChunks(this.outputs.map(output => output.bytes()))

    const proTxHashBytes = new Uint8Array(32)
    proTxHashBytes.set(hexToBytes(payload.proTxHash).toReversed())

    const actorIndexBytes = new Uint8Array(2)
    new DataView(actorIndexBytes.buffer, actorIndexBytes.byteOffset, actorIndexBytes.byteLength).setUint16(0, payload.actorIndex, true)

    const sigCountBytes = new Uint8Array([payload.sigs.length])

    const outBytes = new Uint8Array(
      prefixSizeBytes.byteLength +
      prefixBytes.byteLength +
      payloadVersionBytes.byteLength +
      versionWithTypeView.byteLength +
      lockTimeView.byteLength +
      prevoutsBytes.byteLength +
      sequencesBytes.byteLength +
      outputsBytes.byteLength +
      proTxHashBytes.byteLength +
      actorIndexBytes.byteLength +
      sigCountBytes.byteLength
    )

    let off = 0
    outBytes.set(prefixSizeBytes, off); off += prefixSizeBytes.byteLength
    outBytes.set(prefixBytes, off); off += prefixBytes.byteLength
    outBytes.set(payloadVersionBytes, off); off += payloadVersionBytes.byteLength
    outBytes.set(new Uint8Array(versionWithTypeView.buffer), off); off += versionWithTypeView.byteLength
    outBytes.set(new Uint8Array(lockTimeView.buffer), off); off += lockTimeView.byteLength
    outBytes.set(prevoutsBytes, off); off += prevoutsBytes.byteLength
    outBytes.set(sequencesBytes, off); off += sequencesBytes.byteLength
    outBytes.set(outputsBytes, off); off += outputsBytes.byteLength
    outBytes.set(proTxHashBytes, off); off += proTxHashBytes.byteLength
    outBytes.set(actorIndexBytes, off); off += actorIndexBytes.byteLength
    outBytes.set(sigCountBytes, off)

    return bytesToHex(doubleSHA256(outBytes).toReversed())
  }

  /**
   * Hash of the spent outpoints a provider payload commits to (Dash Core CalcTxInputsHash):
   * SHA256d of the concatenated input outpoints
   *
   * Set into the payload's inputsHash when it has one; call after the inputs are final and before signing the payload
   */
  providerInputsHash (): string {
    const inputsHash = bytesToHex(doubleSHA256(this.#concatChunks(this.inputs.map(input => new OutPoint(input.txId, input.vOut).bytes()))).toReversed())

    if (this.extraPayload !== undefined && 'inputsHash' in this.extraPayload) {
      this.extraPayload.inputsHash = inputsHash
    }

    return inputsHash
  }

  /**
   * Transaction size once signed, for fee estimation
   *
   * An input without a scriptSig counts as the largest P2PKH scriptSig sign() produces
   * (73 byte DER signature with sighash, 33 byte compressed key); a provider payload counts with its signature
   */
  signedSize (): number {
    const inputsSize = this.inputs.reduce((acc, input) => {
      const scriptSigSize = input.scriptSig.bytes().byteLength > 0 ? input.scriptSig.bytes().byteLength : P2PKH_SCRIPT_SIG_MAX_SIZE

      return acc + 36 + getCompactVariableSize(scriptSigSize) + scriptSigSize + 4
    }, 0)

    const outputsSize = this.outputs.reduce((acc, output) => acc + output.bytes().byteLength, 0)

    let extraPayloadSize = 0

    if (this.type !== TransactionType.TRANSACTION_NORMAL) {
      const payload = this.extraPayload
      const payloadSize = payload === undefined
        ? 0
        : 'signedSize' in payload ? payload.signedSize() : payload.bytes().byteLength

      extraPayloadSize = getCompactVariableSize(payloadSize) + payloadSize
    }

    return 4 +
      getCompactVariableSize(this.inputs.length) + inputsSize +
      getCompactVariableSize(this.outputs.length) + outputsSize +
      4 +
      extraPayloadSize
  }

  // nSequence of every input, in input order
  #sequencesBytes (): Uint8Array {
    const sequencesBytes = new Uint8Array(this.inputs.length * 4)
    const sequencesView = new DataView(sequencesBytes.buffer)

    this.inputs.forEach((input, i) => {
      sequencesView.setUint32(i * 4, input.sequence, true)
    })

    return sequencesBytes
  }

  #concatChunks (chunks: Uint8Array[]): Uint8Array {
    const out = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.byteLength, 0))

    let off = 0
    for (const chunk of chunks) {
      out.set(chunk, off)
      off += chunk.byteLength
    }

    return out
  }

  /**
   * Whether this is an asset unlock carrying a well-formed payload
   *
   * Judged from the payload bytes, like Dash Core, so it holds for a raw payload too
   */
  isAssetUnlockPayload (): boolean {
    return this.version >= SPECIAL_TRANSACTION_VERSION &&
      this.type === TransactionType.TRANSACTION_ASSET_UNLOCK &&
      this.extraPayload?.bytes().byteLength === ASSET_UNLOCK_PAYLOAD_SIZE
  }

  /**
   * Whether the txid is computed with the quorum signing info zeroed (asset unlock payload version 2+)
   */
  isAssetUnlockWithStableTxid (): boolean {
    return this.isAssetUnlockPayload() && (this.extraPayload as ExtraPayload).bytes()[0] >= ASSET_UNLOCK_STABLE_TXID_VERSION
  }

  /**
   * Outpoints that an InstantSend lock of this transaction pins
   *
   * These are the spent outpoints, except for asset unlocks, which have no inputs
   * and pin the synthetic outpoint {request id of the withdrawal index, 0} instead
   */
  getLockInputs (): OutPoint[] {
    if (this.isAssetUnlockPayload()) {
      const payload = this.extraPayload instanceof AssetUnlockTx
        ? this.extraPayload
        : AssetUnlockTx.fromBytes((this.extraPayload as ExtraPayload).bytes())

      return [payload.getLockOutPoint()]
    }

    return this.inputs.map(input => new OutPoint(input.txId, input.vOut))
  }

  /**
   * Name of the decoded extra payload class, undefined when there is none or it is kept as RawExtraPayload
   */
  getExtraPayloadType (): keyof typeof ExtraPayloadType | undefined {
    if (this.extraPayload instanceof RawExtraPayload) {
      return undefined
    }

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
      case TransactionType.TRANSACTION_PROVIDER_DISSOLVE:
        return 'ProDisTx'
      case TransactionType.TRANSACTION_PROVIDER_UPDATE_SHARE:
        return 'ProUpShareTx'
      case TransactionType.TRANSACTION_PROVIDER_UPDATE_SHARED_REGISTRAR:
        return 'ProUpSharedRegTx'
    }

    return undefined
  }

  #signInput (privateKey: PrivateKey, inputIndex: number): void {
    if (inputIndex >= this.inputs.length) {
      throw new Error(`inputIndex(${inputIndex}) must be less than inputs count ${this.inputs.length}`)
    }
    if (inputIndex < 0) {
      throw new Error(`inputIndex(${inputIndex}) must be greater than 0`)
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

    // ECDSA DER signatures are variable length: each of the r/s integers is
    // 1..33 bytes (a 32-byte scalar plus an optional 0x00 sign-padding byte),
    // and either loses its high byte whenever the leading byte would be < 0x80.
    // Per BIP-66 strict DER encoding the sequence is therefore between 8 bytes
    // (r=s=1 byte) and 72 bytes (r=s=33 bytes); with the trailing sighash byte
    // the pushed value spans 9..73 bytes. secp256k1.sign here is deterministic
    // (RFC6979 + lowS), so a short DER encoding is stable for a given tx+key and
    // must be pushed as-is instead of being rejected as an "invalid" size.
    // https://github.com/bitcoin/bips/blob/master/bip-0066.mediawiki
    const signatureSize = signatureWithSighash.byteLength

    if (signatureSize < 9 || signatureSize > 73) {
      throw new Error(`Invalid signature size ${signatureSize}, expected 9..73 bytes (DER signature + sighash)`)
    }

    const sigOpcode = `OP_PUSHBYTES_${signatureSize}` as OPCODES_ENUM

    inputScript.pushOpCode(sigOpcode, signatureWithSighash)
    inputScript.pushOpCode('OP_PUSHBYTES_33', publicKey.inner)

    this.inputs = savedInputs

    this.inputs[inputIndex].scriptSig = inputScript
  }

  // Sign all inputs of this transaction.
  //   - `PrivateKey`        — sign every input with the same key
  //                           (single-address wallets).
  //   - `PrivateKey[]`      — sign each input with its own key (parallel
  //                           arrays: inputs[i] is signed with privateKey[i]).
  //                           Typical use case is an HD wallet spending UTXOs
  //                           from multiple addresses in one transaction.
  //                           Throws on length mismatch.
  sign (privateKey: PrivateKey | PrivateKey[]): void {
    if (Array.isArray(privateKey)) {
      if (this.inputs.length !== privateKey.length) {
        throw new Error(`Input/key count mismatch: ${this.inputs.length} inputs vs ${privateKey.length} keys`)
      }
      for (let i = 0; i < this.inputs.length; i++) {
        this.#signInput(privateKey[i], i)
      }
      return
    }

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

    const hasExtraPayload = this.type !== TransactionType.TRANSACTION_NORMAL
    const extraPayloadBytes = this.extraPayload?.bytes() ?? new Uint8Array(0)
    const extraPayloadSizeBytes = hasExtraPayload ? encodeCompactSize(extraPayloadBytes.byteLength) : new Uint8Array(0)

    const out = new Uint8Array(versionWithTypeView.byteLength + inputCount.byteLength + inputsSize + outputCount.byteLength + outputsSize + lockTimeView.byteLength + extraPayloadSizeBytes.byteLength + extraPayloadBytes.byteLength)

    out.set(new Uint8Array(versionWithTypeView.buffer), 0)
    out.set(inputCount, 4)
    out.set(inputsBytes, 4 + inputCount.byteLength)
    out.set(outputCount, 4 + inputCount.byteLength + inputsSize)
    out.set(outputsBytes, 4 + inputCount.byteLength + inputsSize + outputCount.byteLength)
    out.set(new Uint8Array(lockTimeView.buffer), 4 + inputCount.byteLength + inputsSize + outputCount.byteLength + outputsSize)
    out.set(extraPayloadSizeBytes, 4 + inputCount.byteLength + inputsSize + outputCount.byteLength + outputsSize + lockTimeView.byteLength)
    out.set(extraPayloadBytes, 4 + inputCount.byteLength + inputsSize + outputCount.byteLength + outputsSize + lockTimeView.byteLength + extraPayloadSizeBytes.byteLength)

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

    const dataView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

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

    if (type !== 0 && lockTimePadding + 4 < bytes.length) {
      const extraPayloadSize = decodeCompactSize(lockTimePadding + 4, bytes)

      let extraPayloadHandler: (bytes: Uint8Array) => ExtraPayload

      switch (type) {
        case TransactionType.TRANSACTION_PROVIDER_REGISTER:
          extraPayloadHandler = ProRegTX.fromBytes
          break
        case TransactionType.TRANSACTION_PROVIDER_UPDATE_SERVICE:
          extraPayloadHandler = ProUpServTx.fromBytes
          break
        case TransactionType.TRANSACTION_PROVIDER_UPDATE_REGISTRAR:
          extraPayloadHandler = ProUpRegTx.fromBytes
          break
        case TransactionType.TRANSACTION_PROVIDER_UPDATE_REVOKE:
          extraPayloadHandler = ProUpRevTx.fromBytes
          break
        case TransactionType.TRANSACTION_COINBASE:
          extraPayloadHandler = CbTx.fromBytes
          break
        case TransactionType.TRANSACTION_QUORUM_COMMITMENT:
          extraPayloadHandler = QcTx.fromBytes
          break
        case TransactionType.TRANSACTION_MASTERNODE_HARD_FORK_SIGNAL:
          extraPayloadHandler = MnHfTx.fromBytes
          break
        case TransactionType.TRANSACTION_ASSET_LOCK:
          extraPayloadHandler = AssetLockTx.fromBytes
          break
        case TransactionType.TRANSACTION_ASSET_UNLOCK:
          extraPayloadHandler = AssetUnlockTx.fromBytes
          break
        case TransactionType.TRANSACTION_PROVIDER_DISSOLVE:
          extraPayloadHandler = ProDisTx.fromBytes
          break
        case TransactionType.TRANSACTION_PROVIDER_UPDATE_SHARE:
          extraPayloadHandler = ProUpShareTx.fromBytes
          break
        case TransactionType.TRANSACTION_PROVIDER_UPDATE_SHARED_REGISTRAR:
          extraPayloadHandler = ProUpSharedRegTx.fromBytes
          break
        default:
          extraPayloadHandler = RawExtraPayload.fromBytes
      }

      const extraPayloadBytes = bytes.slice(lockTimePadding + 4 + getCompactVariableSize(extraPayloadSize), lockTimePadding + 4 + getCompactVariableSize(extraPayloadSize) + Number(extraPayloadSize))

      try {
        extraPayload = extraPayloadHandler(extraPayloadBytes)
      } catch {
        // e.g. a payload version introduced by a later hard fork, keep the bytes so the transaction still round-trips
        extraPayload = RawExtraPayload.fromBytes(extraPayloadBytes)
      }
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
      extraPayload: this.extraPayload?.toJSON() ?? null,
      hash: this.hash(),
      ...(this.isAssetUnlockWithStableTxid() ? { instanceHash: this.instanceHash() } : {}),
      ...(this.isSharedRegistration() ? { consentHash: this.consentHash() } : {}),
      ...(this.extraPayload instanceof ProDisTx ? { dissolveSignHash: this.dissolveSignHash() } : {})
    }
  }
}
