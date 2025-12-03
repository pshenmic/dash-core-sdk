import {sha256} from "sha.js";
import ripemd160 from "ripemd160";

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
  } else if (BigInt(num) > BigInt(4294967295) && BigInt(num) <= BigInt("18446744073709551615")) {
    const dataView = new DataView(new ArrayBuffer(8))

    dataView.setBigUint64(0, BigInt(num), true)

    const out = new Uint8Array(9)
    out.set(new Uint8Array([255]), 0)
    out.set(new Uint8Array(dataView.buffer), 1)

    return out
  } else {
    throw new Error("Cannot encode compactSize number")
  }
}

export function getCompactVariableSize(num: number | bigint): number {
  if (num <= 252) {
    return 1
  } else if (num > 252 && num <= 65535 ) {
    return 3
  } else if (num > 65535 && num <= 4294967295) {
    return 5
  } else {
    return 9
  }
}

export function doubleSHA256(data: Uint8Array): Uint8Array {
  const firstStage = new Uint8Array(new sha256().update(data).digest())

  return new Uint8Array(new sha256().update(firstStage).digest())
}

export function SHA256RIPEMD160(data: Uint8Array): Uint8Array {
  const firstStage = new Uint8Array(new sha256().update(data).digest())

  return  new Uint8Array(new ripemd160().update(firstStage).digest())
}