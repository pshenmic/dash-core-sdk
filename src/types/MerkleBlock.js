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
    bytes() {
        const headerBytes = this.blockHeader.bytes();
        const merkleTreeBytes = this.merkleTree.bytes();
        const out = new Uint8Array(headerBytes.length + merkleTreeBytes.length);
        out.set(headerBytes, 0);
        out.set(merkleTreeBytes, headerBytes.length);
        return out;
    }
    toJSON() {
        return {
            blockHeader: this.blockHeader.toJSON(),
            merkleTree: this.merkleTree.toJSON()
        };
    }
}
