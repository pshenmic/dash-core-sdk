import { Script } from './Script.js'
import { bytesToHex, decodeCompactSize, encodeCompactSize, getCompactVariableSize, hexToBytes } from '../utils.js'
import { NetworkLike, PayoutShareJSON } from '../types.js'
import { DEFAULT_NETWORK } from '../constants.js'

/**
 * Owner payout entry of ProTx version 3+ (Dash Core MasternodePayoutShare)
 */
export class PayoutShare {
  scriptPayout: Script
  // share of the owner reward in basis points, 100..10000
  reward: number

  constructor (scriptPayout: Script, reward: number) {
    this.scriptPayout = scriptPayout
    this.reward = reward
  }

  getPayoutAddress (network: NetworkLike = DEFAULT_NETWORK): string | undefined {
    return this.scriptPayout.getAddress(network)
  }

  static fromBytes (bytes: Uint8Array): PayoutShare {
    const dataView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

    const scriptPayoutSize = Number(decodeCompactSize(0, bytes))
    const scriptPayoutOffset = getCompactVariableSize(scriptPayoutSize)
    const scriptPayout = Script.fromBytes(bytes.slice(scriptPayoutOffset, scriptPayoutOffset + scriptPayoutSize))

    const reward = dataView.getUint16(scriptPayoutOffset + scriptPayoutSize, true)

    return new PayoutShare(scriptPayout, reward)
  }

  static fromHex (hex: string): PayoutShare {
    return PayoutShare.fromBytes(hexToBytes(hex))
  }

  bytes (): Uint8Array {
    const scriptPayoutBytes = this.scriptPayout.bytes()
    const scriptPayoutSizeBytes = encodeCompactSize(scriptPayoutBytes.byteLength)

    const out = new Uint8Array(scriptPayoutSizeBytes.byteLength + scriptPayoutBytes.byteLength + 2)

    out.set(scriptPayoutSizeBytes, 0)
    out.set(scriptPayoutBytes, scriptPayoutSizeBytes.byteLength)
    new DataView(out.buffer).setUint16(scriptPayoutSizeBytes.byteLength + scriptPayoutBytes.byteLength, this.reward, true)

    return out
  }

  hex (): string {
    return bytesToHex(this.bytes())
  }

  toJSON (): PayoutShareJSON {
    return {
      scriptPayout: this.scriptPayout.ASMString(),
      reward: this.reward
    }
  }
}
