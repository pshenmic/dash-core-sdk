import {
  BLOOM_FILTER_FALSE_POSITIVE_RATE,
  BLOOM_FILTER_FBA_CONSTANT,
} from "../constants";
import BloomFilter from 'bloom-filter'
import {encodeCompactSize} from "../utils";

export class BloomFilterWriter {
  nTweak: number
  nFlags: number

  constructor(nTweak?: number, nFlags?: number) {
    this.nTweak = nTweak ?? 0;
    this.nFlags = nFlags ?? 0;
  }

  /**
   * SOME DATA MUST BE REVERSED, LIKE TX HASH
   * @param data
   */
  createBloomFilter(data: Uint8Array[]): Uint8Array {
    const bloomFilter = BloomFilter.create(data.length, BLOOM_FILTER_FALSE_POSITIVE_RATE, this.nTweak, this.nFlags)

    for(let i=0; i<data.length; i++){
      bloomFilter.insert(data[i])
    }

    const nHashFuncsBytes = new DataView(new ArrayBuffer(4))
    const nTweakBytes = new DataView(new ArrayBuffer(4))

    const sizeBytes = encodeCompactSize(bloomFilter.vData.length)

    const filterLoad = new Uint8Array(sizeBytes.byteLength+bloomFilter.vData.length+4+4+1);

    nHashFuncsBytes.setUint32(0,bloomFilter.nHashFuncs, true)
    nTweakBytes.setUint32(0, bloomFilter.nTweak, true)

    filterLoad.set(sizeBytes,0)
    filterLoad.set(new Uint8Array(bloomFilter.vData), sizeBytes.byteLength);
    filterLoad.set(new Uint8Array(nHashFuncsBytes.buffer), sizeBytes.byteLength+bloomFilter.vData.length);
    filterLoad.set(new Uint8Array(nTweakBytes.buffer), sizeBytes.byteLength+bloomFilter.vData.length+4);
    filterLoad.set([this.nFlags], sizeBytes.byteLength+bloomFilter.vData.length+8);

    return filterLoad;
  }
}