import { QfCommitJSON } from '../../types.js';
export declare class QfCommit {
    version: number;
    llmqType: number;
    quorumHash: string;
    quorumIndex?: number;
    signers: string;
    validMembers: string;
    quorumPublicKey: string;
    quorumVvecHash: string;
    quorumSig: string;
    sig: string;
    constructor(version: number, llmqType: number, quorumHash: string, signers: string, validMembers: string, quorumPublicKey: string, quorumVvecHash: string, quorumSig: string, sig: string, quorumIndex?: number);
    static fromBytes(bytes: Uint8Array): QfCommit;
    static fromHex(hex: string): QfCommit;
    bytes(): Uint8Array;
    hex(): string;
    toJSON(): QfCommitJSON;
}
