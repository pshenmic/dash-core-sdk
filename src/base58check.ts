import { base58 } from '@scure/base'
import { bytesToHex, doubleSHA256 } from './utils.js'

const Base58Check = {
  encode: (data: Uint8Array): string => {
    const checksumHash = doubleSHA256(data)

    const out = new Uint8Array(data.byteLength + 4)

    out.set(data, 0)
    out.set(checksumHash.slice(0, 4), data.byteLength)

    return base58.encode(out)
  },
  decode: (data: string, skipVerify?: boolean) => {
    const bytes = base58.decode(data)
    const body = bytes.slice(0, -4)

    if (skipVerify != null && skipVerify) {
      const passedChecksum = bytes.slice(-4)
      const correctedChecksum = doubleSHA256(body).slice(0, 4)

      if (bytesToHex(passedChecksum) !== bytesToHex(correctedChecksum)) {
        throw new Error('Base58check decode failed: incorrect checksum provided')
      }
    }

    return body
  }
}

export { Base58Check }
