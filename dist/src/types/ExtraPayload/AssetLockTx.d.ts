import { Output } from '../Output.js';
import { AssetLockTxJSON } from '../../types.js';
export declare class AssetLockTx {
    version: number;
    count: number;
    outputs: Output[];
    constructor(version: number, count: number, outputs: Output[]);
    static fromBytes(bytes: Uint8Array): AssetLockTx;
    static fromHex(hex: string): AssetLockTx;
    bytes(): Uint8Array;
    hex(): string;
    toJSON(): AssetLockTxJSON;
}
