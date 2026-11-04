import { describe, expect, test } from '@jest/globals'
import { secp256k1 } from '@noble/curves/secp256k1.js'
import { PrivateKey } from '../src/types/PrivateKey.js'
import { Network } from '../src/constants.js'
import { hexToBytes } from '../src/utils.js'
import { recoverCompact, signCompact, verifyCompact } from '../src/compactSignature.js'

const KEY = new PrivateKey(hexToBytes('11'.repeat(32)), Network.Testnet, true)
const UNCOMPRESSED_KEY = new PrivateKey(hexToBytes('11'.repeat(32)), Network.Testnet, false)
const HASH = '22'.repeat(32)
const N = secp256k1.Point.CURVE().n

function headerByte (signature: string): number {
  return Number.parseInt(signature.slice(0, 2), 16)
}

function flipToHighS (signature: string): string {
  const header = headerByte(signature)
  const compressed = header >= 31
  const recid = (header - 27) & 3
  const s = BigInt('0x' + signature.slice(66, 130))
  const highS = (N - s).toString(16).padStart(64, '0')
  const newHeader = 27 + (recid ^ 1) + (compressed ? 4 : 0)
  return newHeader.toString(16) + signature.slice(2, 66) + highS
}

describe('signCompact', () => {
  test('returns a 65-byte signature with a compressed-key header', () => {
    const signature = signCompact(HASH, KEY)

    expect(signature).toMatch(/^[0-9a-f]{130}$/)
    expect(headerByte(signature)).toBeGreaterThanOrEqual(31)
    expect(headerByte(signature)).toBeLessThanOrEqual(34)
  })

  test('marks an uncompressed signer in the header', () => {
    const header = headerByte(signCompact(HASH, UNCOMPRESSED_KEY))

    expect(header).toBeGreaterThanOrEqual(27)
    expect(header).toBeLessThanOrEqual(30)
  })
})

describe('recoverCompact', () => {
  test('recovers the compressed signing key', () => {
    const recovered = recoverCompact(HASH, signCompact(HASH, KEY))

    expect(recovered.compressed).toBe(true)
    expect(recovered.bytes().byteLength).toBe(33)
    expect(recovered.getPublicKeyHash()).toBe(KEY.getPublicKey().getPublicKeyHash())
  })

  test('recovers the uncompressed signing key', () => {
    const recovered = recoverCompact(HASH, signCompact(HASH, UNCOMPRESSED_KEY))

    expect(recovered.compressed).toBe(false)
    expect(recovered.bytes().byteLength).toBe(65)
    expect(recovered.getPublicKeyHash()).toBe(UNCOMPRESSED_KEY.getPublicKey().getPublicKeyHash())
  })
})

describe('verifyCompact', () => {
  test('accepts a signature from the expected key', () => {
    expect(verifyCompact(HASH, signCompact(HASH, KEY), KEY.getPublicKey().getPublicKeyHash())).toBe(true)
  })

  test('rejects a signature over a different digest', () => {
    expect(verifyCompact('33'.repeat(32), signCompact(HASH, KEY), KEY.getPublicKey().getPublicKeyHash())).toBe(false)
  })

  test('rejects a high-S signature', () => {
    expect(verifyCompact(HASH, flipToHighS(signCompact(HASH, KEY)), KEY.getPublicKey().getPublicKeyHash())).toBe(false)
  })

  test('rejects malformed signatures without throwing', () => {
    expect(verifyCompact(HASH, '00'.repeat(64), KEY.getPublicKey().getPublicKeyHash())).toBe(false)
    expect(verifyCompact(HASH, 'ff' + '00'.repeat(64), KEY.getPublicKey().getPublicKeyHash())).toBe(false)
    expect(verifyCompact(HASH, 'not-hex', KEY.getPublicKey().getPublicKeyHash())).toBe(false)
  })
})
