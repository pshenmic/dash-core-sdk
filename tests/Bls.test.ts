import { describe, expect, test } from '@jest/globals'
import {
  basicToLegacyPublicKey,
  blsPublicKey,
  blsSign,
  blsVerify,
  deriveOperatorAccount,
  deriveOperatorKey,
  deriveOperatorPublicKey,
  deriveOperatorSecretKey,
  legacyToBasicPublicKey,
  operatorAccountPath,
  toBasicPublicKey
} from '../src/bls.js'
import { Network } from '../src/constants.js'
import { bytesToHex, hexToBytes } from '../src/utils.js'

// BIP39 seed of "abandon … about"; expected keys are the dashbls reference vectors
// pinned in rust-dashcore key-wallet, as the wallet's utils/masternodeKeys.ts derives them
const SEED = hexToBytes('5eb00bbddcf069084889a8ab9155568165f5c453ccb85e70811aaed6f6da5fc19a5ac40b389cd370d086206dec8aa6c43daea6690f20ad3d8d48b2d2ce9e38e4')

const MAINNET_OPERATOR_KEYS = [
  '878cad04aae29eb76171937eb7101452b401b026efbc27db840f130374e6a9ec8443d917277f8921e0ba6678a7709875',
  '8c04974d14df3b5eb23787e21642d25c47609d966bb80f504854e4675657c63f4c4c7056f3f007671b911eb390dec4f7',
  '8d14cad34409c74f9dd587fc00be01ca0c527e3793f016eb2a612d78ec45c650e8942fbff3e1ab44a21a6e575ebe80a1'
]

describe('BLS operator key derivation', () => {
  const mainnet = deriveOperatorAccount(SEED, Network.Mainnet)

  test('should derive the operator account at m/9\'/5\'/3\'/3\'', () => {
    expect(operatorAccountPath(Network.Mainnet)).toBe("m/9'/5'/3'/3'")
    expect(operatorAccountPath('testnet')).toBe("m/9'/1'/3'/3'")
    expect(bytesToHex(mainnet.publicKey)).toBe('ad794d053504db3727c1f51aea2112e440fadbade687a9c0243b61523c8ab8eb64061f0a5ec5d8df4b7ec8bdfe722c19')
    expect(bytesToHex(mainnet.chainCode)).toBe('d9659c1bde2fd0e0f799f2f66bbbcfc7378fdea624d73d5d4749dc7222daea5e')
  })

  test('should derive operator public keys from the account node', () => {
    expect([0, 1, 2].map(index => bytesToHex(deriveOperatorPublicKey(mainnet, index)))).toEqual(MAINNET_OPERATOR_KEYS)
  })

  test('should derive the operator secret behind each public key', () => {
    for (const index of [0, 1, 2]) {
      expect(bytesToHex(blsPublicKey(deriveOperatorSecretKey(SEED, Network.Mainnet, index)))).toBe(MAINNET_OPERATOR_KEYS[index])

      const pair = deriveOperatorKey(SEED, 'mainnet', index)
      expect(bytesToHex(pair.publicKey)).toBe(MAINNET_OPERATOR_KEYS[index])
      expect(pair.secretKey).toEqual(deriveOperatorSecretKey(SEED, Network.Mainnet, index))
    }
  })

  test('should derive the testnet operator key on coin type 1', () => {
    expect(bytesToHex(deriveOperatorKey(SEED, Network.Testnet, 0).publicKey))
      .toBe('89d8beabae708de1638487f1aff44b38e8c07d9b09f22d76329d6c8ec01e2ad4d030b660bca40ddbd222373a72c5bcef')
  })

  test('should refuse a hardened or negative index', () => {
    expect(() => deriveOperatorPublicKey(mainnet, 0x80000000)).toThrow('non-hardened')
    expect(() => deriveOperatorSecretKey(SEED, Network.Mainnet, -1)).toThrow('non-hardened')
  })
})

describe('BLS keys and signatures', () => {
  test('should encode the public key of a secret in the basic encoding', () => {
    expect(bytesToHex(blsPublicKey(hexToBytes('00'.repeat(31) + '01'))))
      .toBe('97f1d3a73197d7942695638c4fa9ac0fc3688c4f9774b905a14e3a3f171bac586c55e83ff97a1aeffb3af00adb22c6bb')
  })

  test('should refuse a secret outside the scalar field', () => {
    for (const secret of ['00'.repeat(32), 'ff'.repeat(32), '01'.repeat(31)]) {
      expect(() => blsPublicKey(hexToBytes(secret))).toThrow()
    }
  })

  test('should sign with the basic scheme', () => {
    const secretKey = deriveOperatorSecretKey(SEED, Network.Mainnet, 0)
    const message = hexToBytes('42'.repeat(32))
    const signature = blsSign(message, secretKey)

    expect(signature.byteLength).toBe(96)
    expect(blsVerify(signature, message, hexToBytes(MAINNET_OPERATOR_KEYS[0]))).toBe(true)
    expect(blsVerify(signature, hexToBytes('43'.repeat(32)), hexToBytes(MAINNET_OPERATOR_KEYS[0]))).toBe(false)
    expect(blsVerify(signature, message, hexToBytes(MAINNET_OPERATOR_KEYS[1]))).toBe(false)
  })
})

describe('BLS public key encodings', () => {
  // 0x8c.. has 0x20 clear: the y sign is 0 in basic, so legacy moves no sign bit and clears 0x80
  const basicSignClear = hexToBytes(MAINNET_OPERATOR_KEYS[1])
  // 0xad.. has 0x20 set: legacy carries the sign in 0x80
  const basicSignSet = hexToBytes('ad794d053504db3727c1f51aea2112e440fadbade687a9c0243b61523c8ab8eb64061f0a5ec5d8df4b7ec8bdfe722c19')

  test('should convert between basic and legacy', () => {
    const legacyClear = basicToLegacyPublicKey(basicSignClear)
    const legacySet = basicToLegacyPublicKey(basicSignSet)

    expect(legacyClear[0]).toBe(0x0c)
    expect(legacySet[0]).toBe(0x8d)
    expect(legacyClear.subarray(1)).toEqual(basicSignClear.subarray(1))

    expect(legacyToBasicPublicKey(legacyClear)).toEqual(basicSignClear)
    expect(legacyToBasicPublicKey(legacySet)).toEqual(basicSignSet)
  })

  test('should not modify its input', () => {
    const input = Uint8Array.from(basicSignSet)
    basicToLegacyPublicKey(input)

    expect(input).toEqual(basicSignSet)
  })

  test('should read an unambiguous key in either encoding as basic', () => {
    // 0x20 set: basic only
    expect(toBasicPublicKey(basicSignSet)).toEqual(basicSignSet)
    // 0x80 clear: legacy only
    expect(toBasicPublicKey(basicToLegacyPublicKey(basicSignClear))).toEqual(basicSignClear)
  })

  test('should refuse a key that reads either way', () => {
    // basic with sign clear and legacy with sign set share one encoding
    expect(basicToLegacyPublicKey(basicSignSet)[0] & 0xa0).toBe(0x80)
    expect(() => toBasicPublicKey(basicSignClear)).toThrow('both the legacy and the basic encoding')
    expect(() => toBasicPublicKey(basicToLegacyPublicKey(basicSignSet))).toThrow('both the legacy and the basic encoding')
  })

  test('should refuse invalid keys', () => {
    expect(() => legacyToBasicPublicKey(basicSignSet)).toThrow('Not a legacy')
    expect(() => basicToLegacyPublicKey(new Uint8Array(48))).toThrow()
    expect(() => toBasicPublicKey(new Uint8Array(47))).toThrow('48 bytes')
    expect(() => basicToLegacyPublicKey(Uint8Array.from([0xc0, ...new Uint8Array(47)]))).toThrow()
  })
})
