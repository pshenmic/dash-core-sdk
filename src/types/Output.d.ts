import { Script } from './Script.js';
import { NetworkLike, OutputJSON } from '../types.js';
export declare class Output {
    satoshis: bigint;
    script: Script;
    constructor(satoshis: bigint, script?: Script);
    static fromBytes(bytes: Uint8Array): Output;
    static fromHex(hex: string): Output;
    bytes(): Uint8Array;
    hex(): string;
    generateP2PKH(address: string): void;
    getAddress(network?: NetworkLike): string | undefined;
    toJSON(): OutputJSON;
}
