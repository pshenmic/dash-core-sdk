import { BlockHeader } from './BlockHeader.js';
import { MerkleTree } from './MerkleTree.js';
import { hexToBytes } from '../utils.js';
export class MerkleBlock {
    blockHeader;
    merkleTree;
    constructor(blockHeader, merkleTree) {
        this.blockHeader = blockHeader;
        this.merkleTree = merkleTree;
    }
    static fromBytes(bytes) {
        const blockHeader = BlockHeader.fromBytes(bytes.slice(0, 80));
        const merkleTree = MerkleTree.fromBytes(bytes.slice(80));
        return new MerkleBlock(blockHeader, merkleTree);
    }
    static fromHex(hex) {
        return MerkleBlock.fromBytes(hexToBytes(hex));
    }
    toJSON() {
        return {
            blockHeader: this.blockHeader.toJSON(),
            merkleTree: this.merkleTree.toJSON()
        };
    }
}
