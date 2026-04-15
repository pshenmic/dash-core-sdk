import { Script } from '../Script.js';
import { NetworkLike, ProUpRegTxJSON } from '../../types.js';
export declare class ProUpRegTx {
    version: number;
    proTxHash: string;
    mode: number;
    keyIdVoting: string;
    pubKeyOperator: string;
    scriptPayout: Script;
    inputsHash: string;
    payloadSig: string;
    constructor(version: number, proTxHash: string, mode: number, pubKeyOperator: string, keyIdVoting: string, scriptPayout: Script, inputsHash: string, payloadSig: string);
    getVotingAddress(network?: NetworkLike): string;
    getPayoutAddress(network?: NetworkLike): string | undefined;
    static fromBytes(bytes: Uint8Array): ProUpRegTx;
    static fromHex(hex: string): ProUpRegTx;
    bytes(): Uint8Array;
    hex(): string;
    toJSON(): ProUpRegTxJSON;
}
