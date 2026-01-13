import { OutPoint } from './OutPoint.js';
import { InstantLockJSON } from '../types.js';
export declare class InstantLock {
    version: number;
    inputs: OutPoint[];
    txId: string;
    cycleHash: string;
    signature: string;
    constructor(version: number, inputs: OutPoint[], txId: string, cycleHash: string, signature: string);
    bytes(): Uint8Array;
    hex(): string;
    static fromBytes(bytes: Uint8Array): InstantLock;
    static fromHex(hex: string): InstantLock;
    toJSON(): InstantLockJSON;
}
