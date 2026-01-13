import { Script } from '../Script.js';
import { NetworkLike, ProUpServTxJSON } from '../../types.js';
export declare class ProUpServTx {
    version: number;
    type: number;
    proTxHash: string;
    ipAddress: string;
    port: number;
    scriptOperatorPayout: Script;
    inputsHash: string;
    platformNodeID?: string;
    platformP2PPort?: number;
    platformHTTPPort?: number;
    payloadSig: string;
    constructor(version: number, type: number, proTxHash: string, ipAddress: string, port: number, /* netInfo: Uint8Array, */ scriptOperatorPayout: Script, inputsHash: string, platformNodeID: string, platformP2PPort: number, platformHTTPPort: number, payloadSig: string);
    getOperatorPayoutAddress(network?: NetworkLike): string | undefined;
    static fromBytes(bytes: Uint8Array): ProUpServTx;
    static fromHex(hex: string): ProUpServTx;
    bytes(): Uint8Array;
    hex(): string;
    toJSON(): ProUpServTxJSON;
}
