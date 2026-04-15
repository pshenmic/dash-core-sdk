import { BlockHeader } from './BlockHeader.js';
import { MerkleTree } from './MerkleTree.js';
import { MerkleBlockJSON } from '../types.js';
export declare class MerkleBlock {
    blockHeader: BlockHeader;
    merkleTree: MerkleTree;
    constructor(blockHeader: BlockHeader, merkleTree: MerkleTree);
    static fromBytes(bytes: Uint8Array): MerkleBlock;
    static fromHex(hex: string): MerkleBlock;
    bytes(): Uint8Array;
    toJSON(): MerkleBlockJSON;
}
