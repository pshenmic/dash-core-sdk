import { OutPointJSON } from '../types.js';
export declare class OutPoint {
    txId: string;
    vOut: number;
    constructor(txId: string, vOut: number);
    bytes(): Uint8Array;
    hex(): string;
    static fromBytes(bytes: Uint8Array): OutPoint;
    static fromHex(hex: string): OutPoint;
    toJSON(): OutPointJSON;
}
