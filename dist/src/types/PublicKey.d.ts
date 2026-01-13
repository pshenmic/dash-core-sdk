import { PrivateKey } from './PrivateKey.js';
import { PublicKeyJSON } from '../types.js';
import { Network } from '../constants.js';
export declare class PublicKey {
    inner: Uint8Array;
    compressed: boolean;
    constructor(inner: Uint8Array, compressed: boolean);
    getPublicKeyHash(): string;
    getPublicKeyHashBytes(): Uint8Array;
    static fromPrivateKey(privateKey: PrivateKey): PublicKey;
    getAddress(network: Network): string;
    hex(): string;
    bytes(): Uint8Array;
    static fromBytes(inner: Uint8Array): PublicKey;
    static fromHex(hex: string): PublicKey;
    toJSON(): PublicKeyJSON;
}
