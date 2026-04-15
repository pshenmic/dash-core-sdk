import { Output } from '../Output.js';
import { bytesToHex, hexToBytes } from '../../utils.js';
export class AssetLockTx {
    version;
    count;
    outputs;
    constructor(version, count, outputs) {
        this.version = version;
        this.count = count;
        this.outputs = outputs;
    }
    static fromBytes(bytes) {
        const dataView = new DataView(bytes.buffer);
        const version = dataView.getUint8(0);
        const count = dataView.getUint8(1);
        const outputs = [];
        let outputPadding = 2;
        for (let i = 0; i < count; i++) {
            const output = Output.fromBytes(bytes.slice(outputPadding));
            outputs.push(output);
            outputPadding += output.bytes().byteLength;
        }
        return new AssetLockTx(version, count, outputs);
    }
    static fromHex(hex) {
        return AssetLockTx.fromBytes(hexToBytes(hex));
    }
    bytes() {
        const versionByte = new Uint8Array(1);
        const countByte = new Uint8Array(1);
        new DataView(versionByte.buffer).setUint8(0, this.version);
        new DataView(countByte.buffer).setUint8(0, this.count);
        const outputsBytes = this.outputs.reduce((acc, curr) => {
            const outputBytes = curr.bytes();
            const out = new Uint8Array(outputBytes.byteLength + acc.byteLength);
            out.set(acc, 0);
            out.set(outputBytes, acc.byteLength);
            return out;
        }, new Uint8Array(0));
        const out = new Uint8Array(2 + outputsBytes.byteLength);
        out.set(versionByte, 0);
        out.set(countByte, 1);
        out.set(outputsBytes, 2);
        return out;
    }
    hex() {
        return bytesToHex(this.bytes());
    }
    toJSON() {
        return {
            version: this.version,
            count: this.count,
            outputs: this.outputs.map(output => output.toJSON())
        };
    }
}
