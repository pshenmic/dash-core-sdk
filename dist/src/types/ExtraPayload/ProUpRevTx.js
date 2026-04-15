import { bytesToHex, hexToBytes } from '../../utils.js';
export class ProUpRevTx {
    version;
    proTxHash;
    reason;
    inputsHash;
    payloadSig;
    constructor(version, proTxHash, reason, inputsHash, payloadSig) {
        this.version = version;
        this.proTxHash = proTxHash;
        this.reason = reason;
        this.inputsHash = inputsHash;
        this.payloadSig = payloadSig;
    }
    static fromBytes(bytes) {
        const dataView = new DataView(bytes.buffer);
        const version = dataView.getUint16(0, true);
        const proTxHash = bytes.slice(2, 34);
        const reason = dataView.getUint16(34, true);
        const inputsHash = bytes.slice(36, 68);
        const payloadSig = bytes.slice(68, 68 + 96);
        return new ProUpRevTx(version, bytesToHex(proTxHash.toReversed()), reason, bytesToHex(inputsHash.toReversed()), bytesToHex(payloadSig));
    }
    static fromHex(hex) {
        return ProUpRevTx.fromBytes(hexToBytes(hex));
    }
    bytes() {
        const versionBytes = new Uint8Array(2);
        const reasonBytes = new Uint8Array(2);
        new DataView(versionBytes.buffer).setUint16(0, this.version, true);
        new DataView(reasonBytes.buffer).setUint16(0, this.reason, true);
        const proTxHashBytes = new Uint8Array(32);
        proTxHashBytes.set(hexToBytes(this.proTxHash).toReversed());
        const inputsHashBytes = new Uint8Array(32);
        inputsHashBytes.set(hexToBytes(this.inputsHash).toReversed());
        const payloadSigBytes = hexToBytes(this.payloadSig);
        const outBytes = new Uint8Array(164);
        outBytes.set(versionBytes, 0);
        outBytes.set(proTxHashBytes, 2);
        outBytes.set(reasonBytes, 34);
        outBytes.set(inputsHashBytes, 36);
        outBytes.set(payloadSigBytes, 68);
        return outBytes;
    }
    hex() {
        return bytesToHex(this.bytes());
    }
    toJSON() {
        return {
            inputsHash: this.inputsHash,
            payloadSig: this.payloadSig,
            proTxHash: this.proTxHash,
            reason: this.reason,
            version: this.version
        };
    }
}
