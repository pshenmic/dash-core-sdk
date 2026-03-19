import { BlockHeader } from './BlockHeader.js';
import { Transaction } from './Transaction.js';
import { bytesToHex, decodeCompactSize, encodeCompactSize, getCompactVariableSize, hexToBytes } from '../utils.js';
export class Block {
    blockHeader;
    txCount;
    txs;
    constructor(blockHeader, txCount, txs) {
        this.blockHeader = blockHeader;
        this.txCount = txCount;
        this.txs = txs;
    }
    hash() {
        return this.blockHeader.hash();
    }
    bytes() {
        const headerBytes = this.blockHeader.bytes();
        const txCountBytes = encodeCompactSize(this.txs.length);
        const txBytes = this.txs.map(tx => tx.bytes());
        const txSize = txBytes.reduce((acc, curr) => acc + curr.byteLength, 0);
        const out = new Uint8Array(headerBytes.length + txCountBytes.length + txSize);
        let offset = 0;
        out.set(headerBytes, offset);
        offset += headerBytes.length;
        out.set(txCountBytes, offset);
        offset += txCountBytes.length;
        for (const tx of txBytes) {
            out.set(tx, offset);
            offset += tx.byteLength;
        }
        return out;
    }
    hex() {
        return bytesToHex(this.bytes());
    }
    static fromBytes(bytes) {
        const blockHeader = BlockHeader.fromBytes(bytes.slice(0, 80));
        const txCount = decodeCompactSize(80, bytes);
        const txCountSize = getCompactVariableSize(txCount);
        const txs = [];
        let txOffset = 80 + txCountSize;
        for (let i = BigInt(0); i < txCount; i++) {
            const tx = Transaction.fromBytes(bytes.slice(txOffset));
            txs.push(tx);
            txOffset += tx.bytes().byteLength;
        }
        return new Block(blockHeader, Number(txCount), txs);
    }
    static fromHex(hex) {
        return Block.fromBytes(hexToBytes(hex));
    }
    toJSON() {
        return {
            blockHeader: this.blockHeader.toJSON(),
            txCount: this.txCount,
            txs: this.txs.map(tx => tx.toJSON())
        };
    }
}
