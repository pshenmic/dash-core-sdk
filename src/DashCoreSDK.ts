import GRPCConnectionPool from "./grpcConnectionPool.js";
import {
    BlockHeadersWithChainLocksRequest,
    BlockHeadersWithChainLocksResponse,
    GetBlockchainStatusRequest,
    GetBlockchainStatusResponse, MasternodeListRequest,
    TransactionsWithProofsRequest
} from "../proto/generated/core.js";

interface Transaction {
    transaction: Uint8Array;
    blockHash: Uint8Array;
    height: number;
    confirmations: number;
    isInstantLocked: boolean;
    isChainLocked: boolean;
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
        throw new Error('Not implemented');
    }

    async getBlockchainStatus(): Promise<GetBlockchainStatusResponse> {
        const client = this.grpcConnectionPool.getClient();

        return (await client.getBlockchainStatus(GetBlockchainStatusRequest.fromJson({}))).response
    }

    async getMasternodeStatus() {
        throw new Error('Not implemented');
    }

    async getBlock() {
        throw new Error('Not implemented');
    }

    async getBestBlockHeight() {
        throw new Error('Not implemented');

    }

    async broadcastTransaction() {

        throw new Error('Not implemented');
    }

    async getEstimatedTransactionFee() {
        throw new Error('Not implemented');

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


        const request = MasternodeListRequest.create({
        })

        return client.subscribeToMasternodeList(request)
    }
}
