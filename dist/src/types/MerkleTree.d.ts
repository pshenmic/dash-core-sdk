import { MerkleTreeJSON } from '../types.js';
export declare class MerkleTree {
    transactionCount: number;
    hashes: string[];
    flags: boolean[];
    constructor(transactionCount: number, hashes: string[], flags: boolean[]);
    calcTreeWidth(height: number): number;
    calcHash(height: number, pos: number, txIds: string[]): string;
    parentHash(left: string, right: string): string;
    extractMatches(matches: string[], indexes: number[]): string;
    traverseAndExtract(height: number, pos: number, matches: string[], indexes: number[], state: {
        bitsUsed: number;
        hashUsed: number;
    }): string;
    static fromBytes(bytes: Uint8Array): MerkleTree;
    static fromHex(hex: string): MerkleTree;
    bytes(): Uint8Array;
    toJSON(): MerkleTreeJSON;
}
