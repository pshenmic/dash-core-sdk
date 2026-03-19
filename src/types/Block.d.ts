import { BlockJSON } from '../types.js';
import { BlockHeader } from './BlockHeader.js';
import { Transaction } from './Transaction.js';
export declare class Block {
    blockHeader: BlockHeader;
    txCount: number;
    txs: Transaction[];
    constructor(blockHeader: BlockHeader, txCount: number, txs: Transaction[]);
    hash(): string;
    bytes(): Uint8Array;
    hex(): string;
    static fromBytes(bytes: Uint8Array): Block;
    static fromHex(hex: string): Block;
    toJSON(): BlockJSON;
}
