import { bytesToHex, hexToBytes } from '../../utils.js'
import { RawExtraPayloadJSON } from '../../types.js'

/**
 * Extra payload kept as raw bytes
 *
 * Used for transaction types this SDK does not know and for payloads that fail to decode
 * (e.g. a payload version introduced by a later hard fork), so the transaction still
 * round-trips byte for byte and keeps its txid.
 */
export class RawExtraPayload {
  payload: Uint8Array

  constructor (payload: Uint8Array) {
    this.payload = payload
  }

  static fromBytes (bytes: Uint8Array): RawExtraPayload {
    return new RawExtraPayload(bytes.slice())
  }

  static fromHex (hex: string): RawExtraPayload {
    return RawExtraPayload.fromBytes(hexToBytes(hex))
  }

  bytes (): Uint8Array {
    return this.payload.slice()
  }

  hex (): string {
    return bytesToHex(this.payload)
  }

  toJSON (): RawExtraPayloadJSON {
    return {
      raw: this.hex()
    }
  }
}
