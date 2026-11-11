import {
  bytesToHex,
  doubleSHA256,
  hexToBytes
} from '../../utils.js'
import { ProUpRevTxJSON } from '../../types.js'
import { BLS_SIGNATURE_SIZE, PROTX_BASIC_BLS_VERSION } from '../../constants.js'
import { blsSign } from '../../bls.js'

export class ProUpRevTx {
  version: number
  proTxHash: string
  reason: number
  inputsHash: string
  payloadSig: string

  constructor (version: number, proTxHash: string, reason: number, inputsHash: string, payloadSig: string) {
    this.version = version
    this.proTxHash = proTxHash
    this.reason = reason
    this.inputsHash = inputsHash
    this.payloadSig = payloadSig
  }

  static fromBytes (bytes: Uint8Array): ProUpRevTx {
    const dataView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

    const version = dataView.getUint16(0, true)

    const proTxHash = bytes.slice(2, 34)

    const reason = dataView.getUint16(34, true)

    const inputsHash = bytes.slice(36, 68)

    const payloadSig = bytes.slice(68, 68 + 96)

    return new ProUpRevTx(version, bytesToHex(proTxHash.toReversed()), reason, bytesToHex(inputsHash.toReversed()), bytesToHex(payloadSig))
  }

  static fromHex (hex: string): ProUpRevTx {
    return ProUpRevTx.fromBytes(hexToBytes(hex))
  }

  bytes (): Uint8Array {
    return this.#serialize(true)
  }

  // withSignature false is Core's SER_GETHASH form: no sig.
  // An unsigned payload has no signature bytes at all, not 96 zero bytes.
  #serialize (withSignature: boolean): Uint8Array {
    const versionBytes = new Uint8Array(2)
    const reasonBytes = new Uint8Array(2)

    new DataView(versionBytes.buffer, versionBytes.byteOffset, versionBytes.byteLength).setUint16(0, this.version, true)
    new DataView(reasonBytes.buffer, reasonBytes.byteOffset, reasonBytes.byteLength).setUint16(0, this.reason, true)

    const proTxHashBytes = new Uint8Array(32)
    proTxHashBytes.set(hexToBytes(this.proTxHash).toReversed())

    const inputsHashBytes = new Uint8Array(32)
    inputsHashBytes.set(hexToBytes(this.inputsHash).toReversed())

    const payloadSigBytes = withSignature ? hexToBytes(this.payloadSig) : new Uint8Array(0)

    const outBytes = new Uint8Array(68 + payloadSigBytes.byteLength)

    outBytes.set(versionBytes, 0)
    outBytes.set(proTxHashBytes, 2)
    outBytes.set(reasonBytes, 34)
    outBytes.set(inputsHashBytes, 36)
    outBytes.set(payloadSigBytes, 68)

    return outBytes
  }

  hex (): string {
    return bytesToHex(this.bytes())
  }

  /**
   * SHA256d of the payload without the signature, in internal byte order (Dash Core ::SerializeHash)
   */
  payloadHash (): Uint8Array {
    return doubleSHA256(this.#serialize(false))
  }

  /**
   * Sign with the operator BLS secret key, a basic scheme signature over payloadHash
   *
   * Set inputsHash (Transaction.providerInputsHash) and every other field first, the signature covers them.
   * Version 1 payloads use the legacy BLS scheme, which is not supported.
   */
  signWithOperatorKey (blsSecretKey: Uint8Array): void {
    if (this.version < PROTX_BASIC_BLS_VERSION) {
      throw new Error(`Payload version ${this.version} uses the legacy BLS scheme, which cannot be signed`)
    }

    this.payloadSig = bytesToHex(blsSign(this.payloadHash(), blsSecretKey))
  }

  /**
   * Payload size once signed with a 96 byte BLS signature
   */
  signedSize (): number {
    return this.#serialize(false).byteLength + BLS_SIGNATURE_SIZE
  }

  toJSON (): ProUpRevTxJSON {
    return {
      inputsHash: this.inputsHash,
      payloadSig: this.payloadSig,
      proTxHash: this.proTxHash,
      reason: this.reason,
      version: this.version
    }
  }
}
