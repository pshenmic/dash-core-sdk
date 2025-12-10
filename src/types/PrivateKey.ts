import {Network, WIFNetworkPrefix} from "../constants.js";
import {Base58Check} from "../base58check.js";
import {PublicKey} from "./PublicKey.js";

export class PrivateKey {
  network: Network
  key: Uint8Array
  compressed: boolean

  constructor (key: Uint8Array, network: Network, compressed: boolean) {
    this.key = key
    this.network = network
    this.compressed = compressed
  }

  getPublicKey (): PublicKey {
    return PublicKey.fromPrivateKey(this)
  }

  toWIF (): string {
    const networkByte = WIFNetworkPrefix[this.network]
    const compressedByte = this.compressed ? 1 : 0

    const keyBytes = new Uint8Array(34)

    keyBytes.set(new Uint8Array([networkByte]), 0)
    keyBytes.set(this.key, 1)
    keyBytes.set(new Uint8Array([compressedByte]), 33)

    return Base58Check.encode(keyBytes)
  }

  bytes (): Uint8Array {
    return this.key
  }

  static fromWIF (wif: string): PrivateKey {
    const wifBytes = Base58Check.decode(wif)

    const [networkByte] = wifBytes
    const [compressed] = wifBytes.toReversed()

    const body = wifBytes.slice(1, 33)

    return new PrivateKey(body, WIFNetworkPrefix[networkByte], compressed === 1)
  }

  static fromBytes (bytes: Uint8Array, network: Network, compressed: boolean = true): PrivateKey {
    return new PrivateKey(bytes, network, compressed)
  }
}
