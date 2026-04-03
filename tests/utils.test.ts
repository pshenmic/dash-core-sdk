import { jest } from '@jest/globals'
import {
  getRandomArrayItem,
  hexToBytes,
  bytesToHex,
  encodeCompactSize,
  decodeCompactSize,
  getCompactVariableSize,
  doubleSHA256,
  SHA256RIPEMD160,
  wait
} from '../src/utils.js'

describe('Utils', () => {
  describe('getRandomArrayItem', () => {
    let mathRandomSpy: jest.SpyInstance

    beforeEach(() => {
      mathRandomSpy = jest.spyOn(Math, 'random')
    })

    afterEach(() => {
      mathRandomSpy.mockRestore()
    })

    it('should return first element when random returns 0', () => {
      mathRandomSpy.mockReturnValue(0)
      const array = ['a', 'b', 'c']
      const result = getRandomArrayItem(array)
      expect(result).toBe('a')
    })

    it('should return last element when random returns close to 1', () => {
      mathRandomSpy.mockReturnValue(0.99)
      const array = ['a', 'b', 'c']
      const result = getRandomArrayItem(array)
      expect(result).toBe('c')
    })

    it('should return middle element with appropriate random value', () => {
      mathRandomSpy.mockReturnValue(0.5)
      const array = ['a', 'b', 'c']
      const result = getRandomArrayItem(array)
      expect(result).toBe('b')
    })

    it('should return single element from array', () => {
      const array = ['only']
      const result = getRandomArrayItem(array)
      expect(result).toBe('only')
    })

    it('should work with numeric arrays', () => {
      mathRandomSpy.mockReturnValue(0)
      const array = [10, 20, 30]
      const result = getRandomArrayItem(array)
      expect(result).toBe(10)
    })

    it('should work with object arrays', () => {
      mathRandomSpy.mockReturnValue(0.33)
      const array = [{ id: 1 }, { id: 2 }, { id: 3 }]
      const result = getRandomArrayItem(array)
      expect(result).toEqual(expect.objectContaining({ id: expect.any(Number) }))
    })

    it('should always return an item from the array', () => {
      const array = ['a', 'b', 'c', 'd', 'e']
      for (let i = 0; i < 100; i++) {
        const result = getRandomArrayItem(array)
        expect(array).toContain(result)
      }
    })

    it('should handle null/undefined values in array', () => {
      mathRandomSpy.mockReturnValue(0)
      const array: any[] = [null, undefined, 'value']
      const result = getRandomArrayItem(array)
      expect(result).toBe(null)
    })
  })

  describe('hexToBytes', () => {
    it('should convert simple hex string to bytes', () => {
      const result = hexToBytes('1a2b')
      expect(result).toEqual(new Uint8Array([0x1a, 0x2b]))
    })

    it('should convert single byte hex', () => {
      const result = hexToBytes('ff')
      expect(result).toEqual(new Uint8Array([0xff]))
    })

    it('should convert multiple bytes hex', () => {
      const result = hexToBytes('aabbccdd')
      expect(result).toEqual(new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd]))
    })

    it('should handle empty string', () => {
      const result = hexToBytes('')
      expect(result).toEqual(new Uint8Array([]))
    })

    it('should handle lowercase hex', () => {
      const result = hexToBytes('deadbeef')
      expect(result).toEqual(new Uint8Array([0xde, 0xad, 0xbe, 0xef]))
    })

    it('should handle uppercase hex', () => {
      const result = hexToBytes('DEADBEEF')
      expect(result).toEqual(new Uint8Array([0xde, 0xad, 0xbe, 0xef]))
    })
  })

  describe('bytesToHex', () => {
    it('should convert bytes to hex string', () => {
      const result = bytesToHex(new Uint8Array([0x1a, 0x2b]))
      expect(result).toBe('1a2b')
    })

    it('should convert single byte', () => {
      const result = bytesToHex(new Uint8Array([0xff]))
      expect(result).toBe('ff')
    })

    it('should convert multiple bytes', () => {
      const result = bytesToHex(new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd]))
      expect(result).toBe('aabbccdd')
    })

    it('should handle empty bytes', () => {
      const result = bytesToHex(new Uint8Array([]))
      expect(result).toBe('')
    })

    it('should handle leading zeros', () => {
      const result = bytesToHex(new Uint8Array([0x00, 0x01, 0x0f]))
      expect(result).toBe('00010f')
    })
  })

  describe('hexToBytes and bytesToHex roundtrip', () => {
    it('should convert back and forth without loss', () => {
      const original = 'deadbeefcafebabe'
      const bytes = hexToBytes(original)
      const hex = bytesToHex(bytes)
      expect(hex).toBe(original)
    })

    it('should handle roundtrip with zeros', () => {
      const original = '000102030405'
      const bytes = hexToBytes(original)
      const hex = bytesToHex(bytes)
      expect(hex).toBe(original)
    })
  })

  describe('encodeCompactSize', () => {
    it('should encode size <= 252 as single byte', () => {
      const result = encodeCompactSize(100)
      expect(result).toEqual(new Uint8Array([100]))
    })

    it('should encode size 252', () => {
      const result = encodeCompactSize(252)
      expect(result).toEqual(new Uint8Array([252]))
    })

    it('should encode size 253 as 3-byte format', () => {
      const result = encodeCompactSize(253)
      expect(result.length).toBe(3)
      expect(result[0]).toBe(253)
    })

    it('should encode size between 253 and 65535 as 3 bytes', () => {
      const result = encodeCompactSize(300)
      expect(result.length).toBe(3)
      expect(result[0]).toBe(253)
    })

    it('should encode size 65535 as 3 bytes', () => {
      const result = encodeCompactSize(65535)
      expect(result.length).toBe(3)
      expect(result[0]).toBe(253)
    })

    it('should encode size 65536 as 5 bytes', () => {
      const result = encodeCompactSize(65536)
      expect(result.length).toBe(5)
      expect(result[0]).toBe(254)
    })

    it('should encode large size up to 4294967295 as 5 bytes', () => {
      const result = encodeCompactSize(4294967295)
      expect(result.length).toBe(5)
      expect(result[0]).toBe(254)
    })

    it('should encode very large size as 9 bytes', () => {
      const result = encodeCompactSize(BigInt('4294967296'))
      expect(result.length).toBe(9)
      expect(result[0]).toBe(255)
    })

    it('should throw error for numbers larger than 18446744073709551615', () => {
      expect(() => encodeCompactSize(BigInt('18446744073709551616'))).toThrow()
    })
  })

  describe('decodeCompactSize', () => {
    it('should decode single byte', () => {
      const encoded = new Uint8Array([100])
      const result = decodeCompactSize(0, encoded)
      expect(result).toBe(100)
    })

    it('should decode 3-byte format (253 prefix)', () => {
      const encoded = new Uint8Array([253, 0x05, 0x01])
      const result = decodeCompactSize(0, encoded)
      expect(result).toBe(261) // 0x0105 in little-endian
    })

    it('should decode 5-byte format (254 prefix)', () => {
      const encoded = new Uint8Array([254, 0x00, 0x00, 0x01, 0x00])
      const result = decodeCompactSize(0, encoded)
      expect(result).toBe(65536)
    })

    it('should decode with offset', () => {
      const encoded = new Uint8Array([0xff, 0xff, 100])
      const result = decodeCompactSize(2, encoded)
      expect(result).toBe(100)
    })
  })

  describe('encodeCompactSize and decodeCompactSize roundtrip', () => {
    it('should roundtrip small size', () => {
      const original = 100
      const encoded = encodeCompactSize(original)
      const decoded = decodeCompactSize(0, encoded)
      expect(decoded).toBe(original)
    })

    it('should roundtrip medium size', () => {
      const original = 1000
      const encoded = encodeCompactSize(original)
      const decoded = decodeCompactSize(0, encoded)
      expect(decoded).toBe(original)
    })

    it('should roundtrip large size', () => {
      const original = 100000
      const encoded = encodeCompactSize(original)
      const decoded = decodeCompactSize(0, encoded)
      expect(decoded).toBe(original)
    })
  })

  describe('getCompactVariableSize', () => {
    it('should return 1 for size <= 252', () => {
      expect(getCompactVariableSize(0)).toBe(1)
      expect(getCompactVariableSize(100)).toBe(1)
      expect(getCompactVariableSize(252)).toBe(1)
    })

    it('should return 3 for size 253-65535', () => {
      expect(getCompactVariableSize(253)).toBe(3)
      expect(getCompactVariableSize(1000)).toBe(3)
      expect(getCompactVariableSize(65535)).toBe(3)
    })

    it('should return 5 for size 65536-4294967295', () => {
      expect(getCompactVariableSize(65536)).toBe(5)
      expect(getCompactVariableSize(100000000)).toBe(5)
      expect(getCompactVariableSize(4294967295)).toBe(5)
    })

    it('should return 9 for size > 4294967295', () => {
      expect(getCompactVariableSize(BigInt('4294967296'))).toBe(9)
      expect(getCompactVariableSize(BigInt('18446744073709551615'))).toBe(9)
    })
  })

  describe('doubleSHA256', () => {
    it('should hash data with SHA256 twice', () => {
      const data = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]) // "Hello"
      const result = doubleSHA256(data)
      // Result should be deterministic for "Hello"
      expect(result).toBeInstanceOf(Uint8Array)
      expect(result.length).toBe(32) // SHA256 produces 32 bytes
    })

    it('should produce consistent results', () => {
      const data = new Uint8Array([0x01, 0x02, 0x03])
      const result1 = doubleSHA256(data)
      const result2 = doubleSHA256(data)
      expect(bytesToHex(result1)).toBe(bytesToHex(result2))
    })

    it('should produce different results for different inputs', () => {
      const data1 = new Uint8Array([0x01])
      const data2 = new Uint8Array([0x02])
      const result1 = doubleSHA256(data1)
      const result2 = doubleSHA256(data2)
      expect(bytesToHex(result1)).not.toBe(bytesToHex(result2))
    })
  })

  describe('SHA256RIPEMD160', () => {
    it('should hash data with SHA256 then RIPEMD160', () => {
      const data = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]) // "Hello"
      const result = SHA256RIPEMD160(data)
      // RIPEMD160 produces 20 bytes
      expect(result).toBeInstanceOf(Uint8Array)
      expect(result.length).toBe(20)
    })

    it('should produce consistent results', () => {
      const data = new Uint8Array([0x01, 0x02, 0x03])
      const result1 = SHA256RIPEMD160(data)
      const result2 = SHA256RIPEMD160(data)
      expect(bytesToHex(result1)).toBe(bytesToHex(result2))
    })

    it('should produce different results for different inputs', () => {
      const data1 = new Uint8Array([0x01])
      const data2 = new Uint8Array([0x02])
      const result1 = SHA256RIPEMD160(data1)
      const result2 = SHA256RIPEMD160(data2)
      expect(bytesToHex(result1)).not.toBe(bytesToHex(result2))
    })
  })

  describe('wait', () => {
    it('should resolve after specified milliseconds', async () => {
      const start = Date.now()
      await wait(100)
      const end = Date.now()
      expect(end - start).toBeGreaterThanOrEqual(100)
    })

    it('should be callable multiple times', async () => {
      const start = Date.now()
      await wait(50)
      await wait(50)
      const end = Date.now()
      expect(end - start).toBeGreaterThanOrEqual(100)
    })
  })
})
