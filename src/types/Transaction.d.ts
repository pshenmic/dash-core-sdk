import { ExtraPayloadType, TransactionType } from '../constants.js';
import { ExtraPayload, TransactionJSON } from '../types.js';
import { Input } from './Input.js';
import { Output } from './Output.js';
import { PrivateKey } from './PrivateKey.js';
export declare class Transaction {
    #private;
    version: number;
    type: TransactionType;
    inputs: Input[];
    outputs: Output[];
    extraPayload?: ExtraPayload;
    constructor(inputs?: Input[], outputs?: Output[], nLockTime?: number, version?: number, type?: TransactionType, extraPayload?: ExtraPayload);
    get nLockTime(): Date | number;
    set nLockTime(nLockTime: number | Date);
    addInput(inputs: Input): void;
    addOutput(output: Output): void;
    getOutputAmount(): bigint;
    hash(): string;
    getExtraPayloadType(): keyof typeof ExtraPayloadType | undefined;
    sign(privateKey: PrivateKey): void;
    generateChange(address: string, inputAmount: bigint): void;
    bytes(): Uint8Array;
    hex(): string;
    static fromBytes(bytes: Uint8Array): Transaction;
    static fromHex(hex: string): Transaction;
    toJSON(): TransactionJSON;
}
