import { MnHfSignal } from '../Messages/MnHfSignal.js';
import { bytesToHex, hexToBytes } from '../../utils.js';
export class MnHfTx {
    version;
    commitment;
    constructor(version, commitment) {
        this.version = version;
        this.commitment = commitment;
    }
    static fromBytes(bytes) {
        const dataView = new DataView(bytes.buffer);
        const version = dataView.getUint8(0);
        const commitment = MnHfSignal.fromBytes(bytes.slice(1));
        return new MnHfTx(version, commitment);
    }
    static fromHex(hex) {
        return MnHfTx.fromBytes(hexToBytes(hex));
    }
    bytes() {
        const versionByte = new Uint8Array(1);
        new DataView(versionByte.buffer).setUint8(0, this.version);
        const commitmentBytes = this.commitment.bytes();
        const out = new Uint8Array(1 + commitmentBytes.byteLength);
        out.set(versionByte, 0);
        out.set(commitmentBytes, 1);
        return out;
    }
    hex() {
        return bytesToHex(this.bytes());
    }
    toJSON() {
        return {
            version: this.version,
            commitment: this.commitment.toJSON()
        };
    }
}
