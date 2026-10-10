import { bytesToHex, bytesToIp, decodeCompactSize, encodeCompactSize, getCompactVariableSize, hexToBytes, ipToBytes } from '../utils.js'
import { ExtNetInfoJSON, NetInfoEntryJSON } from '../types.js'

/**
 * Index of an address list in ExtNetInfo, as defined by Dash Core NetInfoPurpose
 */
export enum NetInfoPurpose {
  CORE_P2P = 0,
  PLATFORM_P2P = 1,
  PLATFORM_HTTPS = 2
}

export enum NetInfoEntryType {
  Service = 0x01,
  Domain = 0x02,
  Invalid = 0xff
}

/**
 * BIP155 (addrv2) network ids
 */
export enum AddrV2Network {
  IPv4 = 1,
  IPv6 = 2,
  TorV2 = 3,
  TorV3 = 4,
  I2P = 5,
  CJDNS = 6
}

export const EXT_NET_INFO_VERSION = 1

export interface NetInfoEntry {
  type: number
  // BIP155 network id, only for Service entries
  network?: number
  // dotted IPv4, IPv6, domain name, or hex for other addrv2 networks
  address?: string
  port?: number
}

function addressToString (network: number, addressBytes: Uint8Array): string {
  if (network === AddrV2Network.IPv4 && addressBytes.byteLength === 4) {
    return bytesToIp(addressBytes)
  }

  if (network === AddrV2Network.IPv6 && addressBytes.byteLength === 16) {
    const view = new DataView(addressBytes.buffer, addressBytes.byteOffset, addressBytes.byteLength)
    const parts: string[] = []

    for (let i = 0; i < 16; i += 2) {
      parts.push(view.getUint16(i, false).toString(16).padStart(4, '0'))
    }

    return parts.join(':')
  }

  return bytesToHex(addressBytes)
}

function addressToBytes (address: string): Uint8Array {
  // addressToString falls back to hex for anything that is not a well-formed IPv4 or IPv6
  if (address.includes('.')) {
    return ipToBytes(address, true)
  }

  if (address.includes(':')) {
    return ipToBytes(address)
  }

  return hexToBytes(address)
}

/**
 * Extended masternode network info (ProTx version 3+)
 *
 * Serialized as a version byte followed by a map of NetInfoPurpose to a list of entries.
 * Every entry is a type byte followed by either an addrv2 service or a domain,
 * both with a big-endian port.
 */
export class ExtNetInfo {
  version: number
  entries: Map<number, NetInfoEntry[]>

  constructor (version?: number, entries?: Map<number, NetInfoEntry[]>) {
    this.version = version ?? EXT_NET_INFO_VERSION
    this.entries = entries ?? new Map()
  }

  /**
   * First valid entry of the given purpose
   */
  getPrimaryEntry (purpose: NetInfoPurpose = NetInfoPurpose.CORE_P2P): NetInfoEntry | undefined {
    return this.entries.get(purpose)?.find(entry => entry.type === NetInfoEntryType.Service || entry.type === NetInfoEntryType.Domain)
  }

  /**
   * First valid entry of the given purpose as "host:port", IPv6 hosts are wrapped in brackets
   */
  getPrimary (purpose: NetInfoPurpose = NetInfoPurpose.CORE_P2P): string | undefined {
    const entry = this.getPrimaryEntry(purpose)

    if (entry?.address == null || entry.port == null) {
      return undefined
    }

    const host = entry.network === AddrV2Network.IPv6 ? `[${entry.address}]` : entry.address

    return `${host}:${entry.port}`
  }

  static fromBytes (bytes: Uint8Array): ExtNetInfo {
    const dataView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

    const version = dataView.getUint8(0)
    const entries = new Map<number, NetInfoEntry[]>()

    // Dash Core reads nothing past the version byte for unknown versions
    if (version === 0 || version > EXT_NET_INFO_VERSION) {
      return new ExtNetInfo(version, entries)
    }

    let cursor = 1

    const purposesCount = Number(decodeCompactSize(cursor, bytes))
    cursor += getCompactVariableSize(purposesCount)

    for (let i = 0; i < purposesCount; i++) {
      const purpose = dataView.getUint8(cursor)
      cursor += 1

      const entriesCount = Number(decodeCompactSize(cursor, bytes))
      cursor += getCompactVariableSize(entriesCount)

      const list: NetInfoEntry[] = []

      for (let j = 0; j < entriesCount; j++) {
        const type = dataView.getUint8(cursor)
        cursor += 1

        if (type === NetInfoEntryType.Service) {
          const network = dataView.getUint8(cursor)
          cursor += 1

          const addressSize = Number(decodeCompactSize(cursor, bytes))
          cursor += getCompactVariableSize(addressSize)

          const address = addressToString(network, bytes.slice(cursor, cursor + addressSize))
          cursor += addressSize

          const port = dataView.getUint16(cursor, false)
          cursor += 2

          list.push({ type, network, address, port })
        } else if (type === NetInfoEntryType.Domain) {
          const domainSize = Number(decodeCompactSize(cursor, bytes))
          cursor += getCompactVariableSize(domainSize)

          const address = new TextDecoder().decode(bytes.slice(cursor, cursor + domainSize))
          cursor += domainSize

          const port = dataView.getUint16(cursor, false)
          cursor += 2

          list.push({ type, address, port })
        } else {
          // Dash Core reads only the type byte of an unknown entry
          list.push({ type })
        }
      }

      entries.set(purpose, list)
    }

    return new ExtNetInfo(version, entries)
  }

  static fromHex (hex: string): ExtNetInfo {
    return ExtNetInfo.fromBytes(hexToBytes(hex))
  }

  bytes (): Uint8Array {
    const chunks: Uint8Array[] = [new Uint8Array([this.version])]

    if (this.version !== 0 && this.version <= EXT_NET_INFO_VERSION) {
      // std::map serializes in ascending key order
      const purposes = [...this.entries.keys()].sort((a, b) => a - b)

      chunks.push(encodeCompactSize(purposes.length))

      for (const purpose of purposes) {
        const list = this.entries.get(purpose) ?? []

        chunks.push(new Uint8Array([purpose]), encodeCompactSize(list.length))

        for (const entry of list) {
          chunks.push(new Uint8Array([entry.type]))

          if (entry.type !== NetInfoEntryType.Service && entry.type !== NetInfoEntryType.Domain) {
            continue
          }

          const addressBytes = entry.type === NetInfoEntryType.Service
            ? addressToBytes(entry.address ?? '')
            : new TextEncoder().encode(entry.address ?? '')

          const portBytes = new Uint8Array(2)
          new DataView(portBytes.buffer).setUint16(0, entry.port ?? 0, false)

          if (entry.type === NetInfoEntryType.Service) {
            chunks.push(new Uint8Array([entry.network ?? 0]))
          }

          chunks.push(encodeCompactSize(addressBytes.byteLength), addressBytes, portBytes)
        }
      }
    }

    const out = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.byteLength, 0))

    let off = 0
    for (const chunk of chunks) {
      out.set(chunk, off)
      off += chunk.byteLength
    }

    return out
  }

  hex (): string {
    return bytesToHex(this.bytes())
  }

  toJSON (): ExtNetInfoJSON {
    const entries: Record<string, NetInfoEntryJSON[]> = {}

    for (const [purpose, list] of this.entries) {
      entries[NetInfoPurpose[purpose]?.toLowerCase() ?? String(purpose)] = list.map(entry => ({
        type: entry.type,
        network: entry.network ?? null,
        address: entry.address ?? null,
        port: entry.port ?? null
      }))
    }

    return {
      version: this.version,
      entries
    }
  }
}
