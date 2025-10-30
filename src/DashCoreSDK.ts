import GRPCConnectionPool from "./grpcConnectionPool.js";
import {
    BlockHeadersWithChainLocksRequest,
    BlockHeadersWithChainLocksResponse, BroadcastTransactionRequest,
    BroadcastTransactionResponse, GetBestBlockHeightRequest, GetBestBlockHeightResponse,
    GetBlockchainStatusRequest,
    GetBlockchainStatusResponse, GetBlockRequest, GetBlockResponse,
    GetEstimatedTransactionFeeRequest, GetEstimatedTransactionFeeResponse, GetMasternodeStatusRequest,
    GetMasternodeStatusResponse, GetTransactionRequest, MasternodeListRequest,
    TransactionsWithProofsRequest
} from "../proto/generated/core.js";
import type {JsonValue} from "@protobuf-ts/runtime/build/types/json-typings";

interface Transaction {
    transaction: Uint8Array;
    blockHash: Uint8Array;
    height: number;
    confirmations: number;
    isInstantLocked: boolean;
    isChainLocked: boolean;
}

interface BlockRequest {
    hash?: string;
    height?: number;
}

export interface BloomFilter {
    vData: Uint8Array;
    nHashFuncs: number;
    nTweak: number;
    nFlags: number;
}

export class DashCoreSDK {
    grpcConnectionPool: GRPCConnectionPool


    constructor() {
        this.grpcConnectionPool = new GRPCConnectionPool('testnet', {dapiUrl: 'http://127.0.0.1:1443', poolLimit: 5});
    }

    async getTransaction(txid: string): Promise<Transaction> {
        const client = this.grpcConnectionPool.getClient()

        return (await client.getTransaction(GetTransactionRequest.fromJson({id: txid}))).response
    }

    async getBlockchainStatus(): Promise<GetBlockchainStatusResponse> {
        const client = this.grpcConnectionPool.getClient();

        return (await client.getBlockchainStatus(GetBlockchainStatusRequest.fromJson({}))).response
    }

    async getMasternodeStatus(): Promise<GetMasternodeStatusResponse> {
        const client = this.grpcConnectionPool.getClient();

        return (await client.getMasternodeStatus(GetMasternodeStatusRequest.fromJson({}))).response
    }

    async getBlock({hash, height}: { hash?: string, height?: number }): Promise<GetBlockResponse> {
        if (!hash && !height) {
            throw new Error("Hash or height cannot be undefined or null");
        }

        const client = this.grpcConnectionPool.getClient();

        const req: BlockRequest = {}

        if (hash) {
            req.hash = hash;
        } else {
            req.height = height;
        }

        return (await client.getBlock(GetBlockRequest.fromJson({...req}))).response
    }

    async getBestBlockHeight(): Promise<GetBestBlockHeightResponse> {
        const client = this.grpcConnectionPool.getClient();

        return (await client.getBestBlockHeight(GetBestBlockHeightRequest.fromJson({}))).response
    }

    async broadcastTransaction(transaction: Uint8Array, allowHighFees?: boolean, bypassLimits?: boolean): Promise<BroadcastTransactionResponse> {
        const client = this.grpcConnectionPool.getClient();

        return (await client.broadcastTransaction(BroadcastTransactionRequest.create({
            transaction: transaction,
            allowHighFees: allowHighFees ?? false,
            bypassLimits: bypassLimits ?? false,
        }))).response
    }

    async getEstimatedTransactionFee(blocks: number): Promise<GetEstimatedTransactionFeeResponse> {
        const client = this.grpcConnectionPool.getClient();

        return (await client.getEstimatedTransactionFee(GetEstimatedTransactionFeeRequest.fromJson({blocks}))).response
    }

    subscribeToBlockHeadersWithChainLocks(count: number = 0, fromBlockHash?: Uint8Array, fromBlockHeight?: number): AsyncIterable<BlockHeadersWithChainLocksResponse> {
        throw new Error('Not implemented');

        // const client = this.grpcConnectionPool.getClient();
        //
        // const request = BlockHeadersWithChainLocksRequest.fromPartial({
        //     fromBlockHash: fromBlockHash ? (fromBlockHash) : undefined,
        //     fromBlockHeight,
        //     count,
        // })
        //
        // const stream = client.subscribeToBlockHeadersWithChainLocks(request)
        //
        // return stream
    }

    subscribeToTransactions(addresses: string[]): ReadableStream {
        // todo validate

        return new ReadableStream({
            start(controller) {
                setTimeout(() => {
                    controller.enqueue("test");
                    controller.close()
                }, 1000)
            },
            cancel() {
            },
        })
    }

    subscribeToTransactionsWithProofs(bloomFilter: BloomFilter, count: number, sendTransactionHashes: boolean, fromBlockHash: Uint8Array, fromBlockHeight: number, abortController: AbortController) {
        const client = this.grpcConnectionPool.getClient(abortController);

        const bloomFilter1 = {
            vData: new Uint8Array(bloomFilter.vData),
            nHashFuncs: bloomFilter.nHashFuncs,
            nTweak: bloomFilter.nTweak,
            nFlags: bloomFilter.nFlags
        }
        const request = TransactionsWithProofsRequest.create({
            bloomFilter: bloomFilter1,
            fromBlock: {
                oneofKind: "fromBlockHash",
                fromBlockHash: fromBlockHash,
            },
            count,
            sendTransactionHashes
        })

        return client.subscribeToTransactionsWithProofs(request)
    }

    subscribeToMasternodeList() {
        const client = this.grpcConnectionPool.getClient();


        const request = MasternodeListRequest.create({})

        return client.subscribeToMasternodeList(request)
    }
}
