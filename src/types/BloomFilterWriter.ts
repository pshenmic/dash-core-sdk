import murmur3 from "imurmurhash"
import {
  BLOOM_FILTER_FALSE_POSITIVE_RATE,
  BLOOM_FILTER_FBA_CONSTANT,
  MAX_BLOOM_FILTER_FUNC_COUNT,
  MAX_BLOOM_FILTER_SIZE
} from "../constants";
import {encodeCompactSize, getCompactVariableSize} from "../utils";

export class BloomFilterWriter {
  nTweak: number
  nFlags: number

  constructor(nTweak?: number, nFlags?: number) {
    this.nTweak = nTweak ?? 0;
    this.nFlags = nFlags ?? 0;
  }

  bloomHash(nHashNum: number, data: Uint8Array, nFilterBits: number): number {
    const seed = (nHashNum * BLOOM_FILTER_FBA_CONSTANT + this.nTweak) & 0xffffffff

    const hash = murmur3(new TextDecoder('ascii').decode(data), seed)

    return hash.result() % nFilterBits
  }

  createBloomFilter(data: Uint8Array[]): Uint8Array {
    const filterSize = (-1 / (Math.log(2) ** 2) * data.length * Math.log(BLOOM_FILTER_FALSE_POSITIVE_RATE)) / 8

    const nFilterBytes = Math.floor(Math.min(filterSize, MAX_BLOOM_FILTER_SIZE));
    const nFilterBits = nFilterBytes*8;
    const nHashFuncs = Math.floor(Math.min(nFilterBytes * 8 / data.length * Math.log(2), MAX_BLOOM_FILTER_FUNC_COUNT));

    const vData = new Uint8Array(nFilterBytes).fill(0);

    for(let element = 0; element < data.length; element++) {
      for(let hashNum=0; hashNum<nHashFuncs; hashNum++) {

        const nIndex = this.bloomHash(hashNum, data[element], nFilterBits);

        const byteIndex = Math.floor(nIndex / 8);

        const bitOffset = nIndex % 8;

        vData[byteIndex] |= (1 << bitOffset);
      }
    }

    const nHashFuncsBytes = new DataView(new ArrayBuffer(4))
    const nTweakBytes = new DataView(new ArrayBuffer(4))

    const sizeBytes = encodeCompactSize(vData.byteLength)

    const filterLoad = new Uint8Array(sizeBytes.byteLength+vData.byteLength+4+4+1);

    nHashFuncsBytes.setUint32(0,nHashFuncs, true)
    nTweakBytes.setUint32(0, this.nTweak, true)

    filterLoad.set(sizeBytes,0)
    filterLoad.set(vData, sizeBytes.byteLength);
    filterLoad.set(new Uint8Array(nHashFuncsBytes.buffer), sizeBytes.byteLength+vData.byteLength);
    filterLoad.set(new Uint8Array(nTweakBytes.buffer), sizeBytes.byteLength+vData.byteLength+4);
    filterLoad.set([this.nFlags], sizeBytes.byteLength+vData.byteLength+8);

    return filterLoad;
  }
}