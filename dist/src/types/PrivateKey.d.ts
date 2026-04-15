import { Network } from '../constants.js';
import { PublicKey } from './PublicKey.js';
import { NetworkLike } from '../types.js';
export declare class PrivateKey {
    network: Network;
    key: Uint8Array;
    compressed: boolean;
    constructor(key: Uint8Array, network: NetworkLike, compressed: boolean);
    getPublicKey(): PublicKey;
    getAddress(): string;
    toWIF(): string;
    bytes(): Uint8Array;
    static fromWIF(wif: string): PrivateKey;
    static fromBytes(bytes: Uint8Array, network: NetworkLike, compressed?: boolean): PrivateKey;
}
