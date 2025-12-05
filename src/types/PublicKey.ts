import {PrivateKey} from "./PrivateKey";
import {secp256k1} from "@noble/curves/secp256k1.js";
import {bytesToHex, hexToBytes, SHA256RIPEMD160} from "../utils";
import {Base58Check} from "../base58check";

export class PublicKey {
  inner: Uint8Array
  compressed: boolean

  constructor(inner: Uint8Array, compressed: boolean) {
    this.inner = inner
    this.compressed = compressed
  }

  getPublicKeyHash(): string {
    return bytesToHex(this.getPublicKeyHashBytes())
  }

  getPublicKeyHashBytes(): Uint8Array {
    return SHA256RIPEMD160(this.inner)
  }

  static fromPrivateKey(privateKey: PrivateKey): PublicKey {
    const inner = secp256k1.getPublicKey(privateKey.key, privateKey.compressed)

    return new PublicKey(inner, privateKey.compressed)
  }

  getAddress(): string {
    return Base58Check.encode(SHA256RIPEMD160(this.inner))
  }

  hex(): string {
    return bytesToHex(this.inner)
  }

  bytes(): Uint8Array {
    return this.inner
  }

  static fromBytes(inner: Uint8Array) {
    if(inner.byteLength === 33){
      return new PublicKey(inner, true)
    } else if(inner.byteLength === 65){
      return new PublicKey(inner, false)
    } else{
      throw new Error('Incorrect bytes length for public key inner')
    }
  }

  static fromHex(hex: string): PublicKey {
    return PublicKey.fromBytes(hexToBytes(hex))
  }
}