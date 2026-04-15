import { bytesToHex, hexToBytes } from '../utils.js';
export class OutPoint {
    txId;
    vOut;
    constructor(txId, vOut) {
        this.txId = txId;
        this.vOut = vOut;
    }
    bytes() {
        const out = new Uint8Array(36);
        const vOutView = new DataView(new ArrayBuffer(4));
        vOutView.setUint32(0, this.vOut, true);
        const txIdBytes = hexToBytes(this.txId);
        out.set(txIdBytes.toReversed(), 0);
        out.set(new Uint8Array(vOutView.buffer), txIdBytes.byteLength);
        return out;
    }
    hex() {
        return bytesToHex(this.bytes());
    }
    static fromBytes(bytes) {
        const dataView = new DataView(bytes.buffer);
        const txId = bytes.slice(0, 32);
        const vOut = dataView.getUint32(32, true);
        return new OutPoint(bytesToHex(txId.toReversed()), vOut);
    }
    static fromHex(hex) {
        return OutPoint.fromBytes(hexToBytes(hex));
    }
    toJSON() {
        return {
            txId: this.txId,
            vOut: this.vOut
        };
    }
}
