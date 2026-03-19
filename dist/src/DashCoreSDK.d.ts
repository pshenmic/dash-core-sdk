import GRPCConnectionPool from './grpcConnectionPool.js';
import { BlockHeadersWithChainLocksResponse, BroadcastTransactionResponse, GetBestBlockHeightResponse, GetBlockchainStatusResponse, GetBlockResponse, GetEstimatedTransactionFeeResponse, GetMasternodeStatusResponse, MasternodeListRequest, type MasternodeListResponse, TransactionsWithProofsRequest, type TransactionsWithProofsResponse } from '../proto/generated/core.js';
import type { ServerStreamingCall } from '@protobuf-ts/runtime-rpc';
import { AssetLockTx } from './types/ExtraPayload/AssetLockTx.js';
import { AssetUnlockTx } from './types/ExtraPayload/AssetUnlockTx.js';
import { CbTx } from './types/ExtraPayload/CbTx.js';
import { MnHfTx } from './types/ExtraPayload/MnHfTx.js';
import { ProRegTX } from './types/ExtraPayload/ProRegTX.js';
import { ProUpRegTx } from './types/ExtraPayload/ProUpRegTx.js';
import { ProUpRevTx } from './types/ExtraPayload/ProUpRevTx.js';
import { ProUpServTx } from './types/ExtraPayload/ProUpServTx.js';
import { QcTx } from './types/ExtraPayload/QcTx.js';
import { MnHfSignal } from './types/Messages/MnHfSignal.js';
import { QfCommit } from './types/Messages/QfCommit.js';
interface DapiTransaction {
    transaction: Uint8Array;
    blockHash: Uint8Array;
    height: number;
    confirmations: number;
    isInstantLocked: boolean;
    isChainLocked: boolean;
}
export interface SubscribeToTransactionsEvent {
    event: 'rawMerkleBlock' | 'rawTransaction' | 'instantSendLockMessage';
    data: string;
}
export interface BloomFilter {
    vData: Uint8Array;
    nHashFuncs: number;
    nTweak: number;
    nFlags: number;
}
export interface PaymentInfo {
    txid: string;
    chainLocked?: number;
    instantLocked?: string;
}
export interface CoreKeyPair {
    address: string;
    wif: string;
}
export { BlockHeader } from './types/BlockHeader.js';
export { BloomFilterWriter } from './types/BloomFilter.js';
export { Input } from './types/Input.js';
export { InstantLock } from './types/InstantLock.js';
export { MerkleBlock } from './types/MerkleBlock.js';
export { MerkleTree } from './types/MerkleTree.js';
export { OutPoint } from './types/OutPoint.js';
export { Output } from './types/Output.js';
export { PrivateKey } from './types/PrivateKey.js';
export { PublicKey } from './types/PublicKey.js';
export { Script } from './types/Script.js';
export { Transaction } from './types/Transaction.js';
declare const extraPayload: {
    AssetLockTx: typeof AssetLockTx;
    AssetUnlockTx: typeof AssetUnlockTx;
    CbTx: typeof CbTx;
    MnHfTx: typeof MnHfTx;
    ProRegTX: typeof ProRegTX;
    ProUpRegTx: typeof ProUpRegTx;
    ProUpRevTx: typeof ProUpRevTx;
    ProUpServTx: typeof ProUpServTx;
    QcTx: typeof QcTx;
};
declare const messages: {
    MnHfSignal: typeof MnHfSignal;
    QfCommit: typeof QfCommit;
};
export { messages as Messages };
export { extraPayload as ExtraPayload };
export declare class DashCoreSDK {
    grpcConnectionPool: GRPCConnectionPool;
    constructor(dapiUrl?: string);
    generateAddress(): Promise<CoreKeyPair>;
    getTransaction(txid: string): Promise<DapiTransaction>;
    getBlockchainStatus(): Promise<GetBlockchainStatusResponse>;
    getMasternodeStatus(): Promise<GetMasternodeStatusResponse>;
    getBlock({ hash, height }: {
        hash?: string;
        height?: number;
    }): Promise<GetBlockResponse>;
    getBestBlockHeight(): Promise<GetBestBlockHeightResponse>;
    broadcastTransaction(transaction: Uint8Array, allowHighFees?: boolean, bypassLimits?: boolean): Promise<BroadcastTransactionResponse>;
    getEstimatedTransactionFee(blocks: number): Promise<GetEstimatedTransactionFeeResponse>;
    subscribeToBlockHeadersWithChainLocks(count?: number, fromBlockHash?: Uint8Array, fromBlockHeight?: number): AsyncIterable<BlockHeadersWithChainLocksResponse>;
    waitForPayment(address: string, amount?: number): Promise<PaymentInfo>;
    subscribeToTransactions(addresses: string[]): AsyncIterable<SubscribeToTransactionsEvent>;
    subscribeToTransactionsWithProofs(bloomFilter: BloomFilter, count: number, sendTransactionHashes: boolean, fromBlockHash?: Uint8Array, fromBlockHeight?: number, abortController?: AbortController): ServerStreamingCall<TransactionsWithProofsRequest, TransactionsWithProofsResponse>;
    subscribeToMasternodeList(): ServerStreamingCall<MasternodeListRequest, MasternodeListResponse>;
}
