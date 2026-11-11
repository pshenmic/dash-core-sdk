import { bls12_381, bls12_381_Fr as Fr } from '@noble/curves/bls12-381.js'
import { bytesToNumberBE, numberToBytesBE } from '@noble/curves/utils.js'
import { hmac } from '@noble/hashes/hmac.js'
import { sha256 } from '@noble/hashes/sha2.js'
import {
  BLS_HD_SEED_KEY,
  BLS_PUBLIC_KEY_SIZE,
  BLS_SECRET_KEY_SIZE,
  BLS_SIGNATURE_SIZE,
  COIN_TYPE,
  DIP9_PURPOSE,
  MASTERNODE_FEATURE,
  MasternodeKeyRole
} from './constants.js'
import { NetworkLike } from './types.js'
import { concatBytes, networkValueToEnumValue } from './utils.js'

const G1 = bls12_381.G1.Point
const HARDENED_OFFSET = 0x80000000

/**
 * BLS extended secret key: a 32 byte scalar and its chain code
 */
export interface BlsExtendedKey {
  secretKey: Uint8Array
  chainCode: Uint8Array
}

/**
 * BLS operator account node, enough to derive operator public keys without the seed
 */
export interface BlsOperatorAccount {
  publicKey: Uint8Array
  chainCode: Uint8Array
}

export interface BlsKeyPair {
  secretKey: Uint8Array
  publicKey: Uint8Array
}

/**
 * Hardened levels of the operator account, m/9'/coinType'/3'/3'
 */
export function operatorAccountLevels (network: NetworkLike): number[] {
  return [DIP9_PURPOSE, COIN_TYPE[networkValueToEnumValue(network)], MASTERNODE_FEATURE, MasternodeKeyRole.OPERATOR]
}

export function operatorAccountPath (network: NetworkLike): string {
  return `m/${operatorAccountLevels(network).map(level => `${level}'`).join('/')}`
}

// dashbls splits one derivation step into two HMAC-SHA256 calls, suffixed 0 for
// the key and 1 for the chain code, and reduces the key mod r before it is
// hashed into the next step.
function blsStep (key: Uint8Array, data: Uint8Array): BlsExtendedKey {
  const [secretKey, chainCode] = [0, 1].map(suffix => hmac(sha256, key, concatBytes(data, Uint8Array.of(suffix))))

  return { secretKey: Fr.toBytes(Fr.fromBytes(secretKey)), chainCode }
}

// Unlike secp256k1 BIP32, a hardened BLS step has no 0x00 before the key.
function blsHardenedChild ({ secretKey, chainCode }: BlsExtendedKey, level: number): BlsExtendedKey {
  const step = blsStep(chainCode, concatBytes(secretKey, numberToBytesBE(level + HARDENED_OFFSET, 4)))

  return {
    secretKey: Fr.toBytes(Fr.add(Fr.fromBytes(secretKey), Fr.fromBytes(step.secretKey))),
    chainCode: step.chainCode
  }
}

// A non-hardened step hashes the legacy encoding of the parent public key,
// and adds the same tweak to the parent secret that it adds to the parent point.
function operatorTweak (accountPublicKey: Uint8Array, chainCode: Uint8Array, index: number): bigint {
  if (!Number.isInteger(index) || index < 0 || index >= HARDENED_OFFSET) {
    throw new Error(`Operator key index must be a non-hardened integer, got ${index}`)
  }

  return Fr.fromBytes(blsStep(chainCode, concatBytes(basicToLegacyPublicKey(accountPublicKey), numberToBytesBE(index, 4))).secretKey)
}

function deriveOperatorAccountSecret (seed: Uint8Array, network: NetworkLike): BlsExtendedKey {
  return operatorAccountLevels(network).reduce(blsHardenedChild, blsStep(new TextEncoder().encode(BLS_HD_SEED_KEY), seed))
}

/**
 * BLS public key of a 32 byte secret, in the basic (compressed IETF) encoding
 */
export function blsPublicKey (secretKey: Uint8Array): Uint8Array {
  return G1.BASE.multiply(blsSecretScalar(secretKey)).toBytes(true)
}

/**
 * Operator account node at m/9'/coinType'/3'/3', derived from a BIP39 seed the way dashbls does
 */
export function deriveOperatorAccount (seed: Uint8Array, network: NetworkLike): BlsOperatorAccount {
  const account = deriveOperatorAccountSecret(seed, network)

  return { publicKey: blsPublicKey(account.secretKey), chainCode: account.chainCode }
}

/**
 * Operator public key at a non-hardened index under the account node, basic encoding
 */
export function deriveOperatorPublicKey (account: BlsOperatorAccount, index: number): Uint8Array {
  const tweak = operatorTweak(account.publicKey, account.chainCode, index)

  return G1.fromBytes(account.publicKey).add(G1.BASE.multiply(tweak)).toBytes(true)
}

/**
 * Operator secret key at a non-hardened index, the secret behind deriveOperatorPublicKey
 */
export function deriveOperatorSecretKey (seed: Uint8Array, network: NetworkLike, index: number): Uint8Array {
  const account = deriveOperatorAccountSecret(seed, network)
  const accountPublicKey = blsPublicKey(account.secretKey)

  return Fr.toBytes(Fr.add(Fr.fromBytes(account.secretKey), operatorTweak(accountPublicKey, account.chainCode, index)))
}

/**
 * Operator secret and public key at an index
 */
export function deriveOperatorKey (seed: Uint8Array, network: NetworkLike, index: number): BlsKeyPair {
  const secretKey = deriveOperatorSecretKey(seed, network, index)

  return { secretKey, publicKey: blsPublicKey(secretKey) }
}

function blsSecretScalar (secretKey: Uint8Array): bigint {
  if (secretKey.byteLength !== BLS_SECRET_KEY_SIZE) {
    throw new Error(`BLS secret key must be ${BLS_SECRET_KEY_SIZE} bytes, got ${secretKey.byteLength}`)
  }

  const scalar = bytesToNumberBE(secretKey)

  if (!Fr.isValidNot0(scalar)) {
    throw new Error('BLS secret key is outside the scalar field')
  }

  return scalar
}

function requireG1 (publicKey: Uint8Array): void {
  if (publicKey.byteLength !== BLS_PUBLIC_KEY_SIZE) {
    throw new Error(`BLS public key must be ${BLS_PUBLIC_KEY_SIZE} bytes, got ${publicKey.byteLength}`)
  }

  let isInfinity: boolean
  try {
    isInfinity = G1.fromBytes(publicKey).is0()
  } catch {
    throw new Error('Not a BLS public key')
  }

  if (isInfinity) {
    throw new Error('BLS public key is the point at infinity')
  }
}

/**
 * Legacy (pre-basic-scheme) G1 encoding of a basic-encoded public key
 *
 * Basic sets 0x80 (compressed) and puts the y sign in 0x20; legacy drops the
 * compression flag and puts the y sign in 0x80.
 */
export function basicToLegacyPublicKey (publicKey: Uint8Array): Uint8Array {
  requireG1(publicKey)

  const legacy = Uint8Array.from(publicKey)
  legacy[0] = (publicKey[0] & 0x1f) | ((publicKey[0] & 0x20) << 2)

  return legacy
}

/**
 * Basic encoding of a legacy-encoded G1 public key
 */
export function legacyToBasicPublicKey (publicKey: Uint8Array): Uint8Array {
  if (publicKey.byteLength !== BLS_PUBLIC_KEY_SIZE) {
    throw new Error(`BLS public key must be ${BLS_PUBLIC_KEY_SIZE} bytes, got ${publicKey.byteLength}`)
  }

  // the top bits of a 381 bit x below the legacy sign bit are always clear
  if ((publicKey[0] & 0x60) !== 0) {
    throw new Error('Not a legacy BLS public key')
  }

  const basic = Uint8Array.from(publicKey)
  basic[0] = (publicKey[0] & 0x1f) | 0x80 | ((publicKey[0] & 0x80) >> 2)

  requireG1(basic)

  return basic
}

/**
 * Basic encoding of a public key that may be in either encoding, e.g. as a masternode list prints it
 *
 * A key with 0x20 set can only be basic, one with 0x80 clear can only be legacy.
 * A key with 0x80 set and 0x20 clear is a valid point both ways (with opposite y),
 * so it is refused: convert it explicitly with legacyToBasicPublicKey or take it as basic.
 */
export function toBasicPublicKey (publicKey: Uint8Array): Uint8Array {
  if (publicKey.byteLength !== BLS_PUBLIC_KEY_SIZE) {
    throw new Error(`BLS public key must be ${BLS_PUBLIC_KEY_SIZE} bytes, got ${publicKey.byteLength}`)
  }

  const compressedFlag = (publicKey[0] & 0x80) !== 0
  const basicSignFlag = (publicKey[0] & 0x20) !== 0

  if (compressedFlag && !basicSignFlag) {
    throw new Error('BLS public key reads as both the legacy and the basic encoding, convert it explicitly')
  }

  if (compressedFlag) {
    requireG1(publicKey)

    return Uint8Array.from(publicKey)
  }

  return legacyToBasicPublicKey(publicKey)
}

/**
 * BLS basic scheme signature (G2, 96 bytes) of a message, as dashbls BasicSchemeMPL signs
 *
 * For a uint256 Dash Core signs its bytes in internal order.
 */
export function blsSign (message: Uint8Array, secretKey: Uint8Array): Uint8Array {
  blsSecretScalar(secretKey)

  const scheme = bls12_381.longSignatures
  const signature = scheme.Signature.toBytes(scheme.sign(scheme.hash(message), secretKey))

  if (signature.byteLength !== BLS_SIGNATURE_SIZE) {
    throw new Error(`Unexpected BLS signature size ${signature.byteLength}`)
  }

  return signature
}

/**
 * Verify a BLS basic scheme signature against a basic-encoded public key
 */
export function blsVerify (signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array): boolean {
  const scheme = bls12_381.longSignatures

  try {
    return scheme.verify(scheme.Signature.fromBytes(signature), scheme.hash(message), G1.fromBytes(publicKey))
  } catch {
    return false
  }
}
