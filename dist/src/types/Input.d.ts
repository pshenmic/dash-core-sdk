import { Script } from './Script.js';
import { InputJSON } from '../types.js';
export declare class Input {
    txId: string;
    vOut: number;
    scriptSig: Script;
    sequence: number;
    constructor(txId: string | Uint8Array, vOut: number, scriptSig: Script, sequence: number);
    getTxIdHex(): string;
    bytes(): Uint8Array;
    static fromBytes(bytes: Uint8Array): Input;
    hex(): string;
    static fromHex(hex: string): Input;
    toJSON(): InputJSON;
}
