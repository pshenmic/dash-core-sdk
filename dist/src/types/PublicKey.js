import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bytesToHex, hexToBytes, SHA256RIPEMD160 } from '../utils.js';
import { Base58Check } from '../base58check.js';
import { PubKeyHashAddressNetworkPrefix } from '../constants.js';
export class PublicKey {
    inner;
    compressed;
    constructor(inner, compressed) {
        this.inner = inner;
        this.compressed = compressed;
    }
    getPublicKeyHash() {
        return bytesToHex(this.getPublicKeyHashBytes());
    }
    getPublicKeyHashBytes() {
        return SHA256RIPEMD160(this.inner);
    }
    static fromPrivateKey(privateKey) {
        const inner = secp256k1.getPublicKey(privateKey.key, privateKey.compressed);
        return new PublicKey(inner, privateKey.compressed);
    }
    getAddress(network) {
        const prefix = PubKeyHashAddressNetworkPrefix[network];
        const innerHash160 = SHA256RIPEMD160(this.inner);
        const encodable = new Uint8Array(1 + innerHash160.byteLength);
        encodable.set([prefix], 0);
        encodable.set(innerHash160, 1);
        return Base58Check.encode(encodable);
    }
    hex() {
        return bytesToHex(this.inner);
    }
    bytes() {
        return this.inner;
    }
    static fromBytes(inner) {
        if (inner.byteLength === 33) {
            return new PublicKey(inner, true);
        }
        else if (inner.byteLength === 65) {
            return new PublicKey(inner, false);
        }
        else {
            throw new Error('Incorrect bytes length for public key inner');
        }
    }
    static fromHex(hex) {
        return PublicKey.fromBytes(hexToBytes(hex));
    }
    toJSON() {
        return {
            inner: bytesToHex(this.inner),
            compressed: this.compressed
        };
    }
}
