import { MnHfSignalJSON } from '../../types.js';
export declare class MnHfSignal {
    versionBit: number;
    quorumHash: string;
    sig: string;
    constructor(version: number, quorumHash: string, sig: string);
    static fromBytes(bytes: Uint8Array): MnHfSignal;
    static fromHex(hex: string): MnHfSignal;
    bytes(): Uint8Array;
    hex(): string;
    toJSON(): MnHfSignalJSON;
}
