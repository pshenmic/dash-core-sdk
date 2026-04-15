import { MnHfSignal } from '../Messages/MnHfSignal.js';
import { MnHfTxJSON } from '../../types.js';
export declare class MnHfTx {
    version: number;
    commitment: MnHfSignal;
    constructor(version: number, commitment: MnHfSignal);
    static fromBytes(bytes: Uint8Array): MnHfTx;
    static fromHex(hex: string): MnHfTx;
    bytes(): Uint8Array;
    hex(): string;
    toJSON(): MnHfTxJSON;
}
