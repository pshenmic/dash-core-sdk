import { WIFNetworkPrefix } from '../constants.js';
import { Base58Check } from '../base58check.js';
import { PublicKey } from './PublicKey.js';
import { networkValueToEnumValue } from '../utils.js';
export class PrivateKey {
    network;
    key;
    compressed;
    constructor(key, network, compressed) {
        this.key = key;
        this.network = networkValueToEnumValue(network);
        this.compressed = compressed;
    }
    getPublicKey() {
        return PublicKey.fromPrivateKey(this);
    }
    getAddress() {
        const publicKey = PublicKey.fromPrivateKey(this);
        return publicKey.getAddress(this.network);
    }
    toWIF() {
        const networkByte = WIFNetworkPrefix[this.network];
        const compressedByte = this.compressed ? 1 : 0;
        const keyBytes = new Uint8Array(34);
        keyBytes.set(new Uint8Array([networkByte]), 0);
        keyBytes.set(this.key, 1);
        keyBytes.set(new Uint8Array([compressedByte]), 33);
        return Base58Check.encode(keyBytes);
    }
    bytes() {
        return this.key;
    }
    static fromWIF(wif) {
        const wifBytes = Base58Check.decode(wif);
        const [networkByte] = wifBytes;
        const [compressed] = wifBytes.toReversed();
        const body = wifBytes.slice(1, 33);
        return new PrivateKey(body, WIFNetworkPrefix[networkByte], compressed === 1);
    }
    static fromBytes(bytes, network, compressed = true) {
        return new PrivateKey(bytes, networkValueToEnumValue(network), compressed);
    }
}
