import { Script } from './Script.js'
import { bytesToHex, decodeCompactSize, encodeCompactSize, getCompactVariableSize, hexToBytes, publicKeyHashToAddress } from '../utils.js'
import { CollateralShareJSON, NetworkLike } from '../types.js'
import { DEFAULT_NETWORK } from '../constants.js'

/**
 * One participant's contribution to a shared masternode collateral (Dash Core CCollateralShare)
 */
export class CollateralShare {
  amount: bigint
  scriptRefund: Script
  // empty means "use scriptRefund"
  scriptReward: Script
  keyIdOwner: string

  constructor (amount: bigint, scriptRefund: Script, scriptReward: Script, keyIdOwner: string) {
    this.amount = amount
    this.scriptRefund = scriptRefund
    this.scriptReward = scriptReward
    this.keyIdOwner = keyIdOwner
  }

  getOwnerAddress (network: NetworkLike = DEFAULT_NETWORK): string {
    return publicKeyHashToAddress(hexToBytes(this.keyIdOwner), network)
  }

  static fromBytes (bytes: Uint8Array): CollateralShare {
    const dataView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

    const amount = dataView.getBigInt64(0, true)
    let cursor = 8

    const scriptRefundSize = Number(decodeCompactSize(cursor, bytes))
    cursor += getCompactVariableSize(scriptRefundSize)
    const scriptRefund = Script.fromBytes(bytes.slice(cursor, cursor + scriptRefundSize))
    cursor += scriptRefundSize

    const scriptRewardSize = Number(decodeCompactSize(cursor, bytes))
    cursor += getCompactVariableSize(scriptRewardSize)
    const scriptReward = Script.fromBytes(bytes.slice(cursor, cursor + scriptRewardSize))
    cursor += scriptRewardSize

    const keyIdOwner = bytes.slice(cursor, cursor + 20)

    return new CollateralShare(amount, scriptRefund, scriptReward, bytesToHex(keyIdOwner))
  }

  static fromHex (hex: string): CollateralShare {
    return CollateralShare.fromBytes(hexToBytes(hex))
  }

  bytes (): Uint8Array {
    const amountBytes = new Uint8Array(8)
    new DataView(amountBytes.buffer).setBigInt64(0, this.amount, true)

    const scriptRefundBytes = this.scriptRefund.bytes()
    const scriptRefundSizeBytes = encodeCompactSize(scriptRefundBytes.byteLength)
    const scriptRewardBytes = this.scriptReward.bytes()
    const scriptRewardSizeBytes = encodeCompactSize(scriptRewardBytes.byteLength)

    const keyIdOwnerBytes = new Uint8Array(20)
    keyIdOwnerBytes.set(hexToBytes(this.keyIdOwner))

    const out = new Uint8Array(
      amountBytes.byteLength +
      scriptRefundSizeBytes.byteLength +
      scriptRefundBytes.byteLength +
      scriptRewardSizeBytes.byteLength +
      scriptRewardBytes.byteLength +
      keyIdOwnerBytes.byteLength
    )

    let off = 0
    out.set(amountBytes, off); off += amountBytes.byteLength
    out.set(scriptRefundSizeBytes, off); off += scriptRefundSizeBytes.byteLength
    out.set(scriptRefundBytes, off); off += scriptRefundBytes.byteLength
    out.set(scriptRewardSizeBytes, off); off += scriptRewardSizeBytes.byteLength
    out.set(scriptRewardBytes, off); off += scriptRewardBytes.byteLength
    out.set(keyIdOwnerBytes, off)

    return out
  }

  hex (): string {
    return bytesToHex(this.bytes())
  }

  toJSON (): CollateralShareJSON {
    return {
      amount: this.amount.toString(),
      scriptRefund: this.scriptRefund.ASMString(),
      scriptReward: this.scriptReward.ASMString(),
      keyIdOwner: this.keyIdOwner
    }
  }
}
