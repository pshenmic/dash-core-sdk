import { secp256k1 } from '@noble/curves/secp256k1.js'
import { concatBytes } from '@noble/hashes/utils.js'
import {
  COMPACT_SIGNATURE_COMPRESSED_FLAG,
  COMPACT_SIGNATURE_HEADER_BASE,
  COMPACT_SIGNATURE_SIZE,
  MESSAGE_MAGIC
} from './constants.js'
import { doubleSHA256, encodeCompactSize } from './utils.js'
import { PrivateKey } from './types/PrivateKey.js'
import { PublicKey } from './types/PublicKey.js'

/**
 * Digest a signed message commits to (Dash Core CMessageSigner):
 * SHA256d(varint(magic) || magic || varint(message) || message)
 */
export function messageHash (message: string | Uint8Array): Uint8Array {
  const magicBytes = new TextEncoder().encode(MESSAGE_MAGIC)
  const messageBytes = typeof message === 'string' ? new TextEncoder().encode(message) : message

  return doubleSHA256(concatBytes(encodeCompactSize(magicBytes.byteLength), magicBytes, encodeCompactSize(messageBytes.byteLength), messageBytes))
}

/**
 * Compact recoverable signature of a 32 byte hash (Dash Core CKey::SignCompact)
 *
 * 65 bytes: header (27 + recovery id, + 4 for a compressed key), r, s; s is always low.
 * The hash is signed as given, in internal byte order, not the reversed display order.
 */
export function signHash (hash: Uint8Array, privateKey: PrivateKey): Uint8Array {
  if (hash.byteLength !== 32) {
    throw new Error(`Hash must be 32 bytes, got ${hash.byteLength}`)
  }

  const recovered = secp256k1.sign(hash, privateKey.key, { prehash: false, lowS: true, format: 'recovered' })

  const signature = new Uint8Array(COMPACT_SIGNATURE_SIZE)
  signature[0] = COMPACT_SIGNATURE_HEADER_BASE + recovered[0] + (privateKey.compressed ? COMPACT_SIGNATURE_COMPRESSED_FLAG : 0)
  signature.set(recovered.subarray(1), 1)

  return signature
}

/**
 * Public key that produced a compact signature of a 32 byte hash (Dash Core CPubKey::RecoverCompact)
 *
 * The returned key is compressed or not as the signature header says
 */
export function recoverHashSigner (hash: Uint8Array, signature: Uint8Array): PublicKey {
  if (hash.byteLength !== 32) {
    throw new Error(`Hash must be 32 bytes, got ${hash.byteLength}`)
  }

  if (signature.byteLength !== COMPACT_SIGNATURE_SIZE) {
    throw new Error(`Compact signature must be ${COMPACT_SIGNATURE_SIZE} bytes, got ${signature.byteLength}`)
  }

  const header = signature[0] - COMPACT_SIGNATURE_HEADER_BASE

  if (header < 0 || header > 7) {
    throw new Error(`Invalid compact signature header ${signature[0]}`)
  }

  const recoveryId = header & 3
  const compressed = (header & COMPACT_SIGNATURE_COMPRESSED_FLAG) !== 0

  const recovered = new Uint8Array(COMPACT_SIGNATURE_SIZE)
  recovered[0] = recoveryId
  recovered.set(signature.subarray(1), 1)

  const point = secp256k1.Point.fromBytes(secp256k1.recoverPublicKey(recovered, hash, { prehash: false }))

  return new PublicKey(point.toBytes(compressed), compressed)
}

/**
 * Compact signature of a message under the Dash message magic, what `signmessage` produces before base64
 */
export function signMessage (message: string | Uint8Array, privateKey: PrivateKey): Uint8Array {
  return signHash(messageHash(message), privateKey)
}

/**
 * Public key that signed a message, compare its address to the expected signer
 */
export function recoverMessageSigner (message: string | Uint8Array, signature: Uint8Array): PublicKey {
  return recoverHashSigner(messageHash(message), signature)
}
