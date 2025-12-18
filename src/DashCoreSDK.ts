import GRPCConnectionPool from './grpcConnectionPool.js'
import {
  BlockHeadersWithChainLocksResponse,
  BroadcastTransactionRequest,
  BroadcastTransactionResponse,
  GetBestBlockHeightRequest,
  GetBestBlockHeightResponse,
  GetBlockchainStatusRequest,
  GetBlockchainStatusResponse,
  GetBlockRequest,
  GetBlockResponse,
  GetEstimatedTransactionFeeRequest,
  GetEstimatedTransactionFeeResponse,
  GetMasternodeStatusRequest,
  GetMasternodeStatusResponse,
  GetTransactionRequest,
  MasternodeListRequest, type MasternodeListResponse,
  TransactionsWithProofsRequest, type TransactionsWithProofsResponse
} from '../proto/generated/core.js'
import { base58 } from '@scure/base'
import bloomFilter from 'bloom-filter'
import { BLOOM_FILTER_FALSE_POSITIVE_RATE, DAPI_STREAM_RECONNECT_TIMEOUT, DASH_VERSIONS, Network } from './constants.js'
import { bytesToHex, hexToBytes, wait } from './utils.js'
import { p2pkh } from '@scure/btc-signer'
import * as secp from '@noble/secp256k1'
import { PrivateKey } from './types/PrivateKey.js'
import { Transaction } from './types/Transaction.js'
import { InstantLock } from './types/InstantLock.js'
import type { ServerStreamingCall } from '@protobuf-ts/runtime-rpc'

interface DapiTransaction {
  transaction: Uint8Array
  blockHash: Uint8Array
  height: number
  confirmations: number
  isInstantLocked: boolean
  isChainLocked: boolean
}
export interface SubscribeToTransactionsEvent {
  event: 'rawMerkleBlock' | 'rawTransaction' | 'instantSendLockMessage'
  data: string
}
interface BlockRequest {
  hash?: string
  height?: number
}

export interface BloomFilter {
  vData: Uint8Array
  nHashFuncs: number
  nTweak: number
  nFlags: number
}
export interface PaymentInfo {
  txid: string
  chainLocked?: number
  instantLocked?: string
}

export interface CoreKeyPair {
  address: string
  wif: string
}
export class DashCoreSDK {
  grpcConnectionPool: GRPCConnectionPool

  constructor () {
    this.grpcConnectionPool = new GRPCConnectionPool('testnet', { dapiUrl: 'http://127.0.0.1:1443', poolLimit: 5 })
  }

  async generateAddress (): Promise<CoreKeyPair> {
    const { secretKey, publicKey } = secp.keygen()
    const P2PKH = p2pkh(publicKey, DASH_VERSIONS.testnet)

    return {
      wif: PrivateKey.fromBytes(secretKey, Network.Testnet).toWIF(),
      address: P2PKH.address
    }
  }

  async getTransaction (txid: string): Promise<DapiTransaction> {
    const client = this.grpcConnectionPool.getClient()

    return (await client.getTransaction(GetTransactionRequest.fromJson({ id: txid }))).response
  }

  async getBlockchainStatus (): Promise<GetBlockchainStatusResponse> {
    const client = this.grpcConnectionPool.getClient()

    return (await client.getBlockchainStatus(GetBlockchainStatusRequest.fromJson({}))).response
  }

  async getMasternodeStatus (): Promise<GetMasternodeStatusResponse> {
    const client = this.grpcConnectionPool.getClient()

    return (await client.getMasternodeStatus(GetMasternodeStatusRequest.fromJson({}))).response
  }

  async getBlock ({ hash, height }: { hash?: string, height?: number }): Promise<GetBlockResponse> {
    if (hash == null && height == null) {
      throw new Error('Hash or height cannot be undefined or null')
    }

    const client = this.grpcConnectionPool.getClient()

    const req: BlockRequest = {}

    if (hash != null) {
      req.hash = hash
    } else {
      req.height = height
    }

    return (await client.getBlock(GetBlockRequest.fromJson({ ...req }))).response
  }

  async getBestBlockHeight (): Promise<GetBestBlockHeightResponse> {
    const client = this.grpcConnectionPool.getClient()

    return (await client.getBestBlockHeight(GetBestBlockHeightRequest.fromJson({}))).response
  }

  async broadcastTransaction (transaction: Uint8Array, allowHighFees?: boolean, bypassLimits?: boolean): Promise<BroadcastTransactionResponse> {
    const client = this.grpcConnectionPool.getClient()

    return (await client.broadcastTransaction(BroadcastTransactionRequest.create({
      transaction,
      allowHighFees: allowHighFees ?? false,
      bypassLimits: bypassLimits ?? false
    }))).response
  }

  async getEstimatedTransactionFee (blocks: number): Promise<GetEstimatedTransactionFeeResponse> {
    const client = this.grpcConnectionPool.getClient()

    return (await client.getEstimatedTransactionFee(GetEstimatedTransactionFeeRequest.fromJson({ blocks }))).response
  }

  subscribeToBlockHeadersWithChainLocks (count: number = 0, fromBlockHash?: Uint8Array, fromBlockHeight?: number): AsyncIterable<BlockHeadersWithChainLocksResponse> {
    throw new Error('Not implemented')

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

  async waitForPayment (address: string, amount: number = 1000): Promise<PaymentInfo> {
    const pendingTransactions: Transaction[] = []

    const iterator = this.subscribeToTransactions([address])

    for await (const event of iterator) {
      switch (event.event) {
        case 'rawMerkleBlock': {
          await wait(5000)

          for (const pendingTransaction of pendingTransactions) {
            const dapiTransaction = await this.getTransaction(pendingTransaction.hash())
            const transaction = Transaction.fromBytes(dapiTransaction.transaction)

            if (dapiTransaction.isChainLocked && pendingTransaction.hash === transaction.hash && pendingTransaction.outputs
              .some(output => output.satoshis >= amount &&
                    // @ts-expect-error
                    output.script.toAddress('testnet').toString() === address)) {
              return {
                txid: transaction.hash(),
                chainLocked: dapiTransaction.height
              }
            }
          }
          break
        }
        case 'rawTransaction': {
          const tx = event.data
          if (!pendingTransactions.some(tx => tx.hash)) {
            const transaction = Transaction.fromBytes(hexToBytes(tx))
            pendingTransactions.push(transaction)
          }
          break
        }
        case 'instantSendLockMessage': {
          for (const pendingTransaction of pendingTransactions) {
            const instantSendLock = InstantLock.fromHex(event.data)

            if (instantSendLock.txId === pendingTransaction.hash() &&
                pendingTransaction.outputs
                  .some(output => output.satoshis >= amount &&
                        // @ts-expect-error
                        output.script.toAddress('testnet').toString() === address)) {
              return {
                txid: instantSendLock.txId,
                instantLocked: event.data
              }
            }
          }
          break
        }
        default:
          throw new Error('Unknown message send back from from DAPI (subscribeToTransactionsWithProofs)')
      }
    }

    throw new Error('Unreachable code block in waitForPayment')
  }

  async * subscribeToTransactions (addresses: string[]): AsyncIterable<SubscribeToTransactionsEvent> {
    const numberOfElements = 1
    const bf = bloomFilter.create(numberOfElements, BLOOM_FILTER_FALSE_POSITIVE_RATE)

    bf.insert(base58.decode(addresses[0]).slice(1, 21))

    // subscribe to new transactions
    const count = 0

    // send transaction hashes
    const sendTransactionHashes = false

    const fromBlockHeight = (await this.getBestBlockHeight()).height

    const abortController = new AbortController()

    const iterator = this.subscribeToTransactionsWithProofs({ ...bf.toObject() }, count, sendTransactionHashes, undefined, fromBlockHeight, abortController)

    setTimeout(() => {
      abortController.abort('DAPI_RECONNECT_STREAM')
    }, DAPI_STREAM_RECONNECT_TIMEOUT)

    try {
      for await (const event of iterator.responses) {
        const { responses } = event

        switch (responses.oneofKind) {
          case 'rawMerkleBlock': {
            yield ({
              event: 'rawMerkleBlock',
              data: bytesToHex(responses.rawMerkleBlock)
            })
            break
          }
          case 'rawTransactions': {
            for (const transaction of responses.rawTransactions.transactions) {
              const tx = Transaction.fromBytes(transaction)
              if (tx.outputs.some((output) => output.getAddress(Network.Testnet))) {
                yield ({
                  event: 'rawTransaction',
                  data: bytesToHex(transaction)
                })
              }
            }
            break
          }
          case 'instantSendLockMessages': {
            for (const instantSendLockMessage of responses.instantSendLockMessages.messages) {
              yield ({
                event: 'instantSendLockMessage',
                data: bytesToHex(instantSendLockMessage)
              })
            }
            break
          }
          default:
            break
        }
      }
    } catch (e) {
      // resubscribe on DAPI timeout or connection errors
      if (e?.message === 'DAPI_RECONNECT_STREAM') {
        yield * this.subscribeToTransactions(addresses)
      }

      throw e
    }
  }

  subscribeToTransactionsWithProofs (bloomFilter: BloomFilter, count: number, sendTransactionHashes: boolean, fromBlockHash?: Uint8Array, fromBlockHeight?: number, abortController?: AbortController): ServerStreamingCall<TransactionsWithProofsRequest, TransactionsWithProofsResponse> {
    const client = this.grpcConnectionPool.getClient(abortController)

    if ((fromBlockHash == null && fromBlockHeight == null) || (fromBlockHash != null && fromBlockHeight != null)) {
      throw new Error('Either fromBlockHash or fromBlockHeight must be set')
    }

    let fromBlock

    if (fromBlockHash != null) {
      fromBlock = {
        oneofKind: 'fromBlockHash',
        fromBlockHash
      }
    }

    if (fromBlockHeight != null) {
      fromBlock = {
        oneofKind: 'fromBlockHeight',
        fromBlockHeight
      }
    }

    const request = TransactionsWithProofsRequest.create({
      bloomFilter: {
        vData: new Uint8Array(bloomFilter.vData),
        nHashFuncs: bloomFilter.nHashFuncs,
        nTweak: bloomFilter.nTweak,
        nFlags: bloomFilter.nFlags
      },
      fromBlock,
      count,
      sendTransactionHashes
    })

    return client.subscribeToTransactionsWithProofs(request)
  }

  subscribeToMasternodeList (): ServerStreamingCall<MasternodeListRequest, MasternodeListResponse> {
    const client = this.grpcConnectionPool.getClient()

    const request = MasternodeListRequest.create({})

    return client.subscribeToMasternodeList(request)
  }
}
