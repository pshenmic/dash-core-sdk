import {DEFAULT_NETWORK, Network, PubKeyHashAddressNetworkPrefix} from "./constants.js";
import {sha256 as Sha256} from 'sha.js'
import Ripemd160 from 'ripemd160'
import {Base58Check} from "./base58check.js";
import {NetworkLike} from "./types.js";

export function getRandomArrayItem(array: any[]): any {
  return array[Math.floor((Math.random() * array.length))]
}

export function hexToBytes(hex: string): Uint8Array {
  return Uint8Array.from((hex.match(/.{1,2}/g) ?? []).map((byte) => parseInt(byte, 16)))
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.prototype.map.call(bytes, (x: number) => ('00' + x.toString(16)).slice(-2)).join('')
}

export function decodeCompactSize(offset: number, bytes: Uint8Array): number | bigint {
  const dataView = new DataView(bytes.buffer)

  const prefix = dataView.getUint8(offset)

  if (prefix <= 252) {
    return prefix
  } else if (prefix === 253) {
    return dataView.getUint16(offset + 1, true)
  } else if (prefix === 254) {
    return dataView.getUint32(offset + 1, true)
  } else {
    return dataView.getBigUint64(offset + 1, true)
  }
}

export function encodeCompactSize(num: number | bigint): Uint8Array {
  if (num <= 252 && typeof num === 'number') {
    return new Uint8Array([num])
  } else if (num > 252 && num <= 65535 && typeof num === 'number') {
    const dataView = new DataView(new ArrayBuffer(2))

    dataView.setUint16(0, num, true)

    const out = new Uint8Array(3)
    out.set(new Uint8Array([253]), 0)
    out.set(new Uint8Array(dataView.buffer), 1)

    return out
  } else if (num > 65535 && num <= 4294967295 && typeof num === 'number') {
    const dataView = new DataView(new ArrayBuffer(4))

    dataView.setUint32(0, num, true)

    const out = new Uint8Array(5)
    out.set(new Uint8Array([254]), 0)
    out.set(new Uint8Array(dataView.buffer), 1)

    return out
  } else if (BigInt(num) > BigInt(4294967295) && BigInt(num) <= BigInt('18446744073709551615')) {
    const dataView = new DataView(new ArrayBuffer(8))

    dataView.setBigUint64(0, BigInt(num), true)

    const out = new Uint8Array(9)
    out.set(new Uint8Array([255]), 0)
    out.set(new Uint8Array(dataView.buffer), 1)

    return out
  } else {
    throw new Error('Cannot encode compactSize number')
  }
}

export function getCompactVariableSize(num: number | bigint): number {
  if (num <= 252) {
    return 1
  } else if (num > 252 && num <= 65535) {
    return 3
  } else if (num > 65535 && num <= 4294967295) {
    return 5
  } else {
    return 9
  }
}

export async function wait(ms: number): Promise<void> {
  return await new Promise<void>(resolve => setTimeout(resolve, ms))
}

export function doubleSHA256(data: Uint8Array): Uint8Array {
  const firstStage = new Uint8Array(new Sha256().update(data).digest())

  return new Uint8Array(new Sha256().update(firstStage).digest())
}

export function SHA256RIPEMD160(data: Uint8Array): Uint8Array {
  const firstStage = new Uint8Array(new Sha256().update(data).digest())

  return new Uint8Array(new Ripemd160().update(firstStage).digest())
}


export function networkValueToEnumValue(value: Network | keyof typeof Network): Network {
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'mainnet') {
      return Network.Mainnet
    } else {
      return Network.Testnet
    }
  } else {
    return value
  }
}

export function addressToPublicKeyHash(address: string): Uint8Array {
  return Base58Check.decode(address).slice(1)
}

export function publicKeyHashToAddress(hash: Uint8Array, network: NetworkLike =DEFAULT_NETWORK): string {
  const normalNetwork = networkValueToEnumValue(network)
  const prefix: number = PubKeyHashAddressNetworkPrefix[normalNetwork]

  const address = new Uint8Array(1 + hash.byteLength)

  address.set([prefix], 0)
  address.set(hash, 1)

  return Base58Check.encode(address)
}

export function bytesToIp(bytes: Uint8Array) {
  const canContainIPv6 = bytes.byteLength > 4

  if (canContainIPv6) {
    const isIPv4Mapped =
      bytes.slice(0, 10).every(b => b === 0) &&
      bytes[10] === 0xff &&
      bytes[11] === 0xff;

    if (isIPv4Mapped) {
      return Array.from(bytes.slice(12)).join('.');
    } else {
      const parts: string[] = [];

      const view = new DataView(bytes.buffer)
      for (let i = 0; i < bytes.length; i += 2) {
        parts.push(view.getUint16(i, false).toString(16))
      }

      return parts
        .map(part => part.padStart(4, '0'))
        .join(':');
    }
  } else if (bytes.byteLength === 4) {
    return Array.from(bytes).join('.');
  }

  throw new Error('Could not parse IPv6 or IPv4 address')
}


export function ipToBytes(ip: string, compact?: boolean): Uint8Array {
  if (ip.includes('.') && !ip.includes(':')) {
    const parts = ip.split('.');

    if (parts.length !== 4) throw new Error('Invalid IPv4 address');

    const ipBytes = new Uint8Array(parts.map(part => {
      const num = Number(part);

      if (isNaN(num) || num < 0 || num > 255) throw new Error('Invalid IPv4 byte');

      return num;
    }))

    if(compact) {
      return ipBytes
    }

    const fullBytes = new Uint8Array(16)

    const flagBytes = new Uint8Array([0xff,0xff])

    fullBytes.set([...ipBytes.toReversed(), ...flagBytes], 0)

    return fullBytes.toReversed();
  }

  if (ip.includes(':')) {
    const parts = ip.split(':');

    if (parts.length !== 8) throw new Error('Invalid IPv6 address');

    const bytes = new Uint8Array(16);
    const view = new DataView(bytes.buffer);

    for (let i = 0; i < parts.length; i += 1) {
      const val = Number(`0x${parts[i]}`);

      if (isNaN(val) || val < 0 || val > 0xffff) throw new Error('Invalid IPv6 part');

      view.setUint16(i * 2, val, false);
    }

    return bytes;
  }

  throw new Error('Invalid IP address format');
}