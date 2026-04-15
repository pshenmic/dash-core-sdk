import { CbTxJSON } from '../../types.js';
export declare class CbTx {
    version: number;
    height: number;
    merkleRootMNList: string;
    merkleRootQuorums?: string;
    bestCLHeightDiff?: bigint;
    bestCLSignature?: string;
    creditPoolBalance?: bigint;
    constructor(version: number, height: number, merkleRootMNList: string, merkleRootQuorums?: string, bestCLHeightDiff?: bigint, bestCLSignature?: string, creditPoolBalance?: bigint);
    static fromBytes(bytes: Uint8Array): CbTx;
    static fromHex(hex: string): CbTx;
    bytes(): Uint8Array;
    hex(): string;
    toJSON(): CbTxJSON;
}
