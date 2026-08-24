const MAJOR_UNSIGNED = 0
const MAJOR_NEGATIVE = 1
const MAJOR_BYTES = 2
const MAJOR_TEXT = 3
const MAJOR_ARRAY = 4
const MAJOR_MAP = 5
const MAJOR_SIMPLE = 7

const SIMPLE_FALSE = 20
const SIMPLE_TRUE = 21
const SIMPLE_NULL = 22
const SIMPLE_UNDEFINED = 23

const LENGTH_INDEFINITE = 31

/**
 * Decode the CBOR subset DAPI uses for the masternode list diff.
 *
 * DAPI serialises `MasternodeListResponse.masternode_list_diff` as CBOR rather
 * than protobuf, so the payload has to be decoded before the evonode entries
 * can be read. Only the constructs that payload actually contains are
 * supported — integers, byte and text strings, arrays, maps and the simple
 * values — and anything else throws rather than being silently misread.
 *
 * @param bytes - CBOR encoded payload
 */
export default function decodeCBOR (bytes: Uint8Array): unknown {
  let offset = 0

  const takeUint = (size: number): number => {
    if (offset + size > bytes.length) {
      throw new Error('Unexpected end of CBOR input')
    }

    let value = 0

    for (let i = 0; i < size; i++) {
      value = value * 256 + bytes[offset++]
    }

    if (!Number.isSafeInteger(value)) {
      throw new Error('CBOR integer exceeds the safe integer range')
    }

    return value
  }

  const takeBytes = (length: number): Uint8Array => {
    if (offset + length > bytes.length) {
      throw new Error('Unexpected end of CBOR input')
    }

    const slice = bytes.slice(offset, offset + length)
    offset += length

    return slice
  }

  const readArgument = (additional: number): number => {
    if (additional < 24) {
      return additional
    }

    switch (additional) {
      case 24: return takeUint(1)
      case 25: return takeUint(2)
      case 26: return takeUint(4)
      case 27: return takeUint(8)
      case LENGTH_INDEFINITE: throw new Error('Indefinite length CBOR items are not supported')
      default: throw new Error(`Reserved CBOR additional information ${additional}`)
    }
  }

  const readValue = (): unknown => {
    if (offset >= bytes.length) {
      throw new Error('Unexpected end of CBOR input')
    }

    const initial = bytes[offset++]
    const major = initial >> 5
    const additional = initial & 31

    if (major === MAJOR_SIMPLE) {
      switch (additional) {
        case SIMPLE_FALSE: return false
        case SIMPLE_TRUE: return true
        case SIMPLE_NULL: return null
        case SIMPLE_UNDEFINED: return undefined
        default: throw new Error(`Unsupported CBOR simple value ${additional}`)
      }
    }

    const argument = readArgument(additional)

    switch (major) {
      case MAJOR_UNSIGNED:
        return argument

      case MAJOR_NEGATIVE:
        return -1 - argument

      case MAJOR_BYTES:
        return takeBytes(argument)

      case MAJOR_TEXT:
        return new TextDecoder().decode(takeBytes(argument))

      case MAJOR_ARRAY: {
        const items = new Array(argument)

        for (let i = 0; i < argument; i++) {
          items[i] = readValue()
        }

        return items
      }

      case MAJOR_MAP: {
        const entries: Record<string, unknown> = {}

        for (let i = 0; i < argument; i++) {
          const key = readValue()

          if (typeof key !== 'string') {
            throw new Error('Only text keys are supported in CBOR maps')
          }

          entries[key] = readValue()
        }

        return entries
      }

      default:
        throw new Error(`Unsupported CBOR major type ${major}`)
    }
  }

  return readValue()
}
