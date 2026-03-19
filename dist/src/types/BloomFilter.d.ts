export declare class BloomFilterWriter {
    nTweak: number;
    nFlags: number;
    constructor(nTweak?: number, nFlags?: number);
    /**
     * SOME DATA MUST BE REVERSED, LIKE TX HASH
     * @param data
     */
    createBloomFilter(data: Uint8Array[]): Uint8Array;
}
