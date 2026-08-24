import decodeCBOR from '../src/decodeCBOR.js'

const bytes = (...values: number[]): Uint8Array => new Uint8Array(values)

describe('decodeCBOR', () => {
  it('should decode unsigned integers across every argument width', () => {
    expect(decodeCBOR(bytes(0x00))).toBe(0)
    expect(decodeCBOR(bytes(0x17))).toBe(23)
    expect(decodeCBOR(bytes(0x18, 0x18))).toBe(24)
    expect(decodeCBOR(bytes(0x19, 0x05, 0xa3))).toBe(1443)
    expect(decodeCBOR(bytes(0x1a, 0x00, 0x01, 0x00, 0x00))).toBe(65536)
  })

  it('should decode negative integers', () => {
    expect(decodeCBOR(bytes(0x20))).toBe(-1)
    expect(decodeCBOR(bytes(0x38, 0x63))).toBe(-100)
  })

  it('should decode text and byte strings', () => {
    expect(decodeCBOR(bytes(0x63, 0x45, 0x76, 0x6f))).toBe('Evo')
    expect(decodeCBOR(bytes(0x42, 0xde, 0xad))).toEqual(new Uint8Array([0xde, 0xad]))
  })

  it('should decode the simple values', () => {
    expect(decodeCBOR(bytes(0xf4))).toBe(false)
    expect(decodeCBOR(bytes(0xf5))).toBe(true)
    expect(decodeCBOR(bytes(0xf6))).toBeNull()
    expect(decodeCBOR(bytes(0xf7))).toBeUndefined()
  })

  it('should decode nested arrays and maps', () => {
    // {"mnList": [{"nType": 1, "isValid": true}]}
    const payload = bytes(
      0xa1,
      0x66, 0x6d, 0x6e, 0x4c, 0x69, 0x73, 0x74,
      0x81,
      0xa2,
      0x65, 0x6e, 0x54, 0x79, 0x70, 0x65, 0x01,
      0x67, 0x69, 0x73, 0x56, 0x61, 0x6c, 0x69, 0x64, 0xf5
    )

    expect(decodeCBOR(payload)).toEqual({ mnList: [{ nType: 1, isValid: true }] })
  })

  it('should reject a truncated payload instead of returning a partial value', () => {
    expect(() => decodeCBOR(bytes(0x63, 0x45))).toThrow('Unexpected end of CBOR input')
    expect(() => decodeCBOR(bytes(0x19, 0x05))).toThrow('Unexpected end of CBOR input')
    expect(() => decodeCBOR(bytes())).toThrow('Unexpected end of CBOR input')
  })

  it('should reject constructs DAPI never emits rather than misreading them', () => {
    expect(() => decodeCBOR(bytes(0x5f))).toThrow('Indefinite length CBOR items are not supported')
    expect(() => decodeCBOR(bytes(0xc0))).toThrow('Unsupported CBOR major type 6')
    expect(() => decodeCBOR(bytes(0xfb))).toThrow('Unsupported CBOR simple value 27')
    expect(() => decodeCBOR(bytes(0xa1, 0x01, 0x01))).toThrow('Only text keys are supported in CBOR maps')
  })
})
