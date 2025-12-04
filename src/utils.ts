export  function getRandomArrayItem (array: any[]): any {
  return array[Math.floor((Math.random() * array.length))]
}

export  function hexToBytes (hex: string): Uint8Array {
  return Uint8Array.from((hex.match(/.{1,2}/g) ?? []).map((byte) => parseInt(byte, 16)))
}

export const wait = async (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export default function bytesToHex(bytes: Uint8Array): string {
    return Array.prototype.map.call(bytes, (x: number) => ('00' + x.toString(16)).slice(-2)).join('')
}
