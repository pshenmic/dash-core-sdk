import { AssetUnlockTxJSON } from '../../types.js';
export declare class AssetUnlockTx {
    version: number;
    index: bigint;
    fee: number;
    requestedHeight: number;
    quorumHash: string;
    quorumSig: string;
    constructor(version: number, index: bigint, fee: number, requestedHeight: number, quorumHash: string, quorumSig: string);
    static fromBytes(bytes: Uint8Array): AssetUnlockTx;
    static fromHex(hex: string): AssetUnlockTx;
    bytes(): Uint8Array;
    hex(): string;
    toJSON(): AssetUnlockTxJSON;
}
