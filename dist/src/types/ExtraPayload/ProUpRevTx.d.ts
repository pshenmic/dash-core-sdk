import { ProUpRevTxJSON } from '../../types.js';
export declare class ProUpRevTx {
    version: number;
    proTxHash: string;
    reason: number;
    inputsHash: string;
    payloadSig: string;
    constructor(version: number, proTxHash: string, reason: number, inputsHash: string, payloadSig: string);
    static fromBytes(bytes: Uint8Array): ProUpRevTx;
    static fromHex(hex: string): ProUpRevTx;
    bytes(): Uint8Array;
    hex(): string;
    toJSON(): ProUpRevTxJSON;
}
