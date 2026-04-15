import { QfCommit } from '../Messages/QfCommit.js';
import { QcTxJSON } from '../../types.js';
export declare class QcTx {
    version: number;
    height: number;
    commitment: QfCommit;
    constructor(version: number, height: number, commitment: QfCommit);
    static fromBytes(bytes: Uint8Array): QcTx;
    static fromHex(hex: string): QcTx;
    bytes(): Uint8Array;
    hex(): string;
    toJSON(): QcTxJSON;
}
