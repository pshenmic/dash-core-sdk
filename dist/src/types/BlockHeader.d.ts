import { BlockHeaderJSON } from '../types.js';
export declare class BlockHeader {
    version: number;
    previousBlockHash: string;
    merkleRoot: string;
    time: number;
    nBits: number;
    nonce: number;
    constructor(version: number, previousBlockHash: string, merkleRoot: string, time: number, nBits: number, nonce: number);
    hash(): string;
    bytes(): Uint8Array;
    hex(): string;
    static fromBytes(bytes: Uint8Array): BlockHeader;
    static fromHex(hex: string): BlockHeader;
    toJSON(): BlockHeaderJSON;
}
