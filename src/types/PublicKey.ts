import { PrivateKey } from './PrivateKey'
import { secp256k1 } from '@noble/curves/secp256k1.js'
import { bytesToHex, hexToBytes, SHA256RIPEMD160 } from '../utils'
import { Base58Check } from '../base58check'
import { PublicKeyJSON } from '../types'
import { PubKeyHashAddressNetworkPrefix, Network } from '../constants'

export class PublicKey {
  inner: Uint8Array
  compressed: boolean

  constructor (inner: Uint8Array, compressed: boolean) {
    this.inner = inner
    this.compressed = compressed
  }

  getPublicKeyHash (): string {
    return bytesToHex(this.getPublicKeyHashBytes())
  }

  getPublicKeyHashBytes (): Uint8Array {
    return SHA256RIPEMD160(this.inner)
  }

  static fromPrivateKey (privateKey: PrivateKey): PublicKey {
    const inner = secp256k1.getPublicKey(privateKey.key, privateKey.compressed)

    return new PublicKey(inner, privateKey.compressed)
  }

  getAddress (network: Network): string {
    const prefix = PubKeyHashAddressNetworkPrefix[network]
    const innerHash160 = SHA256RIPEMD160(this.inner)

    const encodable = new Uint8Array(1 + innerHash160.byteLength)

    encodable.set([prefix], 0)
    encodable.set(innerHash160, 1)

    return Base58Check.encode(encodable)
  }

  hex (): string {
    return bytesToHex(this.inner)
  }

  bytes (): Uint8Array {
    return this.inner
  }

  static fromBytes (inner: Uint8Array): PublicKey {
    if (inner.byteLength === 33) {
      return new PublicKey(inner, true)
    } else if (inner.byteLength === 65) {
      return new PublicKey(inner, false)
    } else {
      throw new Error('Incorrect bytes length for public key inner')
    }
  }

  static fromHex (hex: string): PublicKey {
    return PublicKey.fromBytes(hexToBytes(hex))
  }

  toJSON (): PublicKeyJSON {
    return {
      inner: bytesToHex(this.inner),
      compressed: this.compressed
    }
  }
}
