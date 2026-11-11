import { describe, expect, test } from '@jest/globals'
import { secp256k1 } from '@noble/curves/secp256k1.js'
import { messageHash, recoverHashSigner, recoverMessageSigner, signHash, signMessage } from '../src/signing.js'
import { PrivateKey } from '../src/types/PrivateKey.js'
import { CbTxVersion, Network, isCbTxV24 } from '../src/constants.js'
import { bytesToHex, concatBytes, doubleSHA256, hexToBytes } from '../src/utils.js'

const b64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64')

describe('message signing', () => {
  // dashcore-lib test/message.js, a signature Dash Core verifymessage accepts
  const wif = 'cR4qogdN9UxLZJXCNFNwDRRZNeLRWuds9TTSuLNweFVjiaE4gPaq'
  const address = 'yZKdLYCvDXa2kyQr8Tg3N6c3xeZoK7XDcj'
  const signature = 'IB+LpNmaTAkB8e6fGgocGKuZ2tAXJ4ZmhhVs7FbOOcHjHPgMHycpAFIl1ojb+PA6jyhufeOKQZKjPnI8VQnevRI='

  test('should hash varint(magic) magic varint(message) message', () => {
    const magic = new TextEncoder().encode('DarkCoin Signed Message:\n')
    const message = new TextEncoder().encode('hello, world')

    expect(messageHash('hello, world')).toEqual(doubleSHA256(concatBytes(Uint8Array.of(magic.length), magic, Uint8Array.of(message.length), message)))
  })

  test('should recover the signer of a recorded signature', () => {
    expect(recoverMessageSigner('hello, world', Buffer.from(signature, 'base64')).getAddress(Network.Testnet)).toBe(address)
  })

  // the recorded signature used a random nonce; exact RFC6979 bytes are pinned by the ProRegTx vector
  test('should sign so that the signer recovers to the address', () => {
    const signed = signMessage('hello, world', PrivateKey.fromWIF(wif))

    expect(signed[0]).toBeGreaterThanOrEqual(31)
    expect(recoverMessageSigner('hello, world', signed).getAddress(Network.Testnet)).toBe(address)
    expect(b64(signed)).toBe(b64(signMessage('hello, world', PrivateKey.fromWIF(wif))))
  })

  test('should not recover the signer of another message', () => {
    expect(recoverMessageSigner('hello, world!', Buffer.from(signature, 'base64')).getAddress(Network.Testnet)).not.toBe(address)
  })
})

describe('hash signing', () => {
  const privateKey = PrivateKey.fromBytes(hexToBytes('11'.repeat(32)), Network.Mainnet)
  const halfOrder = secp256k1.Point.CURVE().n / 2n

  test('should produce 65 bytes with a compressed header and low S', () => {
    for (let i = 0; i < 16; i++) {
      const hash = doubleSHA256(Uint8Array.of(i))
      const signature = signHash(hash, privateKey)

      expect(signature.byteLength).toBe(65)
      expect(signature[0]).toBeGreaterThanOrEqual(31)
      expect(signature[0]).toBeLessThanOrEqual(34)
      expect(BigInt('0x' + bytesToHex(signature.slice(33)))).toBeLessThanOrEqual(halfOrder)
      expect(recoverHashSigner(hash, signature).hex()).toBe(privateKey.getPublicKey().hex())
    }
  })

  test('should use the uncompressed header for an uncompressed key', () => {
    const uncompressed = PrivateKey.fromBytes(privateKey.key, Network.Mainnet, false)
    const hash = doubleSHA256(Uint8Array.of(1))
    const signature = signHash(hash, uncompressed)

    expect(signature[0]).toBeLessThanOrEqual(30)

    const recovered = recoverHashSigner(hash, signature)
    expect(recovered.compressed).toBe(false)
    expect(recovered.getAddress(Network.Mainnet)).toBe(uncompressed.getAddress())
  })

  test('should reject a wrong hash or signature size and an invalid header', () => {
    const hash = doubleSHA256(Uint8Array.of(1))
    const signature = signHash(hash, privateKey)

    expect(() => signHash(new Uint8Array(31), privateKey)).toThrow('32 bytes')
    expect(() => recoverHashSigner(hash, signature.slice(1))).toThrow('65 bytes')

    const badHeader = signature.slice()
    badHeader[0] = 35
    expect(() => recoverHashSigner(hash, badHeader)).toThrow('header')
  })
})

describe('CbTxVersion', () => {
  test('should mark v24 exactly at version 4', () => {
    expect(CbTxVersion.V24).toBe(4)
    expect([0, 1, 2, 3, 4, 5].map(isCbTxV24)).toEqual([false, false, false, false, true, false])
  })
})
