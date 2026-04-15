import { bytesToHex, hexToBytes } from '../../utils.js';
import { QfCommit } from '../Messages/QfCommit.js';
export class QcTx {
    version;
    height;
    commitment;
    constructor(version, height, commitment) {
        this.version = version;
        this.height = height;
        this.commitment = commitment;
    }
    static fromBytes(bytes) {
        const dataView = new DataView(bytes.buffer);
        const version = dataView.getUint16(0, true);
        const height = dataView.getUint32(2, true);
        const commitment = QfCommit.fromBytes(bytes.slice(6));
        return new QcTx(version, height, commitment);
    }
    static fromHex(hex) {
        return QcTx.fromBytes(hexToBytes(hex));
    }
    bytes() {
        const versionBytes = new Uint8Array(2);
        const heightBytes = new Uint8Array(4);
        new DataView(versionBytes.buffer).setUint16(0, this.version, true);
        new DataView(heightBytes.buffer).setUint32(0, this.height, true);
        const commitmentBytes = this.commitment.bytes();
        const out = new Uint8Array(6 + commitmentBytes.byteLength);
        out.set(versionBytes, 0);
        out.set(heightBytes, 2);
        out.set(commitmentBytes, 6);
        return out;
    }
    hex() {
        return bytesToHex(this.bytes());
    }
    toJSON() {
        return {
            version: this.version,
            height: this.height,
            commitment: this.commitment.toJSON()
        };
    }
}
