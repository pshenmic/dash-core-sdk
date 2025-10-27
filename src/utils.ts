export  function getRandomArrayItem (array: any[]): any {
  return array[Math.floor((Math.random() * array.length))]
}

export  function hexToBytes (hex: string): Uint8Array {
  return Uint8Array.from((hex.match(/.{1,2}/g) ?? []).map((byte) => parseInt(byte, 16)))
}
