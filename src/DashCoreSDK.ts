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
  GetMasternodeStatusRequest,
  GetMasternodeStatusResponse,
  GetTransactionRequest,
  MasternodeListRequest, type MasternodeListResponse,
  TransactionsWithProofsRequest, type TransactionsWithProofsResponse
} from '../proto/generated/core.js'
import bloomFilter from 'bloom-filter'
import {
  BLOOM_FILTER_FALSE_POSITIVE_RATE, DAPI_STREAM_RECONNECT_TIMEOUT, DASH_VERSIONS, Network,
  TransactionType
} from './constants.js'
import { addressToPublicKeyHash, bytesToHex, hexToBytes, wait } from './utils.js'
import { p2pkh } from '@scure/btc-signer'
import * as secp from '@noble/secp256k1'
import { PrivateKey } from './types/PrivateKey.js'
import { Transaction } from './types/Transaction.js'
import { InstantLock } from './types/InstantLock.js'
import type { ServerStreamingCall } from '@protobuf-ts/runtime-rpc'
import { AssetLockTx } from './types/ExtraPayload/AssetLockTx.js'
import { AssetUnlockTx } from './types/ExtraPayload/AssetUnlockTx.js'
import { CbTx } from './types/ExtraPayload/CbTx.js'
import { MnHfTx } from './types/ExtraPayload/MnHfTx.js'
import { ProRegTX } from './types/ExtraPayload/ProRegTX.js'
import { ProUpRegTx } from './types/ExtraPayload/ProUpRegTx.js'
import { ProUpRevTx } from './types/ExtraPayload/ProUpRevTx.js'
import { ProUpServTx } from './types/ExtraPayload/ProUpServTx.js'
import { QcTx } from './types/ExtraPayload/QcTx.js'
import { MnHfSignal } from './types/Messages/MnHfSignal.js'
import { QfCommit } from './types/Messages/QfCommit.js'

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

export interface InstantAssetLockProofParams {
  type: 'instantLock'
  transaction: string
  outputIndex: number
  instantLock: string
}

export interface ChainAssetLockProofParams {
  type: 'chainLock'
  txid: string
  outputIndex: number
  coreChainLockedHeight: number
}

export { BlockHeader } from './types/BlockHeader.js'
export { BloomFilterWriter } from './types/BloomFilter.js'
export { Input } from './types/Input.js'
export { InstantLock } from './types/InstantLock.js'
export { MerkleBlock } from './types/MerkleBlock.js'
export { MerkleTree } from './types/MerkleTree.js'
export { OutPoint } from './types/OutPoint.js'
export { Output } from './types/Output.js'
export { PrivateKey } from './types/PrivateKey.js'
export { PublicKey } from './types/PublicKey.js'
export { Script } from './types/Script.js'
export { Transaction } from './types/Transaction.js'

const extraPayload = {
  AssetLockTx,
  AssetUnlockTx,
  CbTx,
  MnHfTx,
  ProRegTX,
  ProUpRegTx,
  ProUpRevTx,
  ProUpServTx,
  QcTx
}

const messages = {
  MnHfSignal,
  QfCommit
}

export { messages as Messages }
export { extraPayload as ExtraPayload }

export class DashCoreSDK {
  grpcConnectionPool: GRPCConnectionPool
  network: 'mainnet' | 'testnet'

  constructor (options: { network?: 'mainnet' | 'testnet', dapiUrl?: string, poolLimit?: number } = {}) {
    this.network = options.network ?? 'testnet'
    this.grpcConnectionPool = new GRPCConnectionPool(this.network, {
      dapiUrl: options.dapiUrl,
      poolLimit: options.poolLimit ?? 5
    })
  }

  private getNetworkType (): Network {
    return this.network === 'mainnet' ? Network.Mainnet : Network.Testnet
  }

  private async getVerifiedTransaction (txid: string): Promise<{ dapiTransaction: DapiTransaction, transaction: Transaction } | undefined> {
    try {
      const dapiTransaction = await this.getTransaction(txid)
      const transaction = Transaction.fromBytes(dapiTransaction.transaction)

      if (transaction.hash() !== txid) {
        return undefined
      }

      return { dapiTransaction, transaction }
    } catch {
      return undefined
    }
  }

  private async getChainLockedPaymentInfo (txid: string, address: string, amount: bigint): Promise<PaymentInfo | undefined> {
    const transactionInfo = await this.getVerifiedTransaction(txid)

    if (transactionInfo == null || !transactionInfo.dapiTransaction.isChainLocked) {
      return undefined
    }

    const transactionMatchesPayment = transactionInfo
      .transaction
      .outputs
      .some(output => output.satoshis >= amount && output.script.getAddress(this.getNetworkType()) === address)

    if (!transactionMatchesPayment) {
      return undefined
    }

    return {
      txid,
      chainLocked: transactionInfo.dapiTransaction.height
    }
  }

  async generateAddress (): Promise<CoreKeyPair> {
    const { secretKey, publicKey } = secp.keygen()
    const networkType = this.getNetworkType()
    const P2PKH = p2pkh(publicKey, DASH_VERSIONS[this.network])

    return {
      wif: PrivateKey.fromBytes(secretKey, networkType).toWIF(),
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

  async getEstimatedTransactionFee (blocks: number): Promise<number> {
    const client = this.grpcConnectionPool.getClient()

    const {response} = (await client.getEstimatedTransactionFee(GetEstimatedTransactionFeeRequest.fromJson({ blocks })))

    return response.fee
  }

  createInstantAssetLockProof (transaction: Transaction, instantLock: InstantLock, outputIndex: number = 0): InstantAssetLockProofParams {
    if (transaction.type !== TransactionType.TRANSACTION_ASSET_LOCK || !(transaction.extraPayload instanceof AssetLockTx)) {
      throw new Error('Asset lock proof requires an asset lock transaction')
    }

    if (outputIndex >= transaction.extraPayload.outputs.length) {
      throw new Error(`outputIndex must be lower than the number of asset lock credit outputs (${transaction.extraPayload.outputs.length})`)
    }

    const txid = transaction.hash()

    if (instantLock.txId !== txid) {
      throw new Error(`InstantLock txid ${instantLock.txId} does not match transaction txid ${txid}`)
    }

    return {
      type: 'instantLock',
      instantLock: instantLock.hex(),
      transaction: transaction.hex(),
      outputIndex
    }
  }

  createChainAssetLockProof (transaction: Transaction, coreChainLockedHeight: number, outputIndex: number = 0): ChainAssetLockProofParams {
    if (!Number.isSafeInteger(coreChainLockedHeight) || coreChainLockedHeight < 0) {
      throw new Error('coreChainLockedHeight must be a non-negative safe integer')
    }

    if (transaction.type !== TransactionType.TRANSACTION_ASSET_LOCK || !(transaction.extraPayload instanceof AssetLockTx)) {
      throw new Error('Asset lock proof requires an asset lock transaction')
    }

    if (outputIndex >= transaction.extraPayload.outputs.length) {
      throw new Error(`outputIndex must be lower than the number of asset lock credit outputs (${transaction.extraPayload.outputs.length})`)
    }

    return {
      type: 'chainLock',
      txid: transaction.hash(),
      outputIndex,
      coreChainLockedHeight
    }
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

  async waitForIncomingTransaction (address: string, amount: bigint = 1000n): Promise<PaymentInfo> {
    const pendingTransactions = new Map<string, Transaction>()
    const pendingInstantLocks = new Map<string, string>()

    const iterator = this.subscribeToTransactions([address])

    for await (const event of iterator) {
      switch (event.event) {
        case 'rawMerkleBlock': {
          await wait(5000)

          for (const txid of pendingTransactions.keys()) {
            const paymentInfo = await this.getChainLockedPaymentInfo(txid, address, amount)

            if (paymentInfo != null) {
              return paymentInfo
            }
          }
          break
        }
        case 'rawTransaction': {
          const transaction = Transaction.fromBytes(hexToBytes(event.data))

          const transactionMatchesPayment = transaction
            .outputs
            .some(output => output.satoshis >= amount && output.script.getAddress(this.getNetworkType()) === address)

          if (!transactionMatchesPayment) {
            break
          }

          const txid = transaction.hash()

          pendingTransactions.set(txid, transaction)

          const pendingInstantLock = pendingInstantLocks.get(txid)

          if (pendingInstantLock != null) {
            return {
              txid,
              instantLocked: pendingInstantLock
            }
          }

          break
        }
        case 'instantSendLockMessage': {
          const instantSendLock = InstantLock.fromHex(event.data)

          if (pendingTransactions.has(instantSendLock.txId)) {
            return {
              txid: instantSendLock.txId,
              instantLocked: event.data
            }
          }

          pendingInstantLocks.set(instantSendLock.txId, event.data)
          break
        }
        default:
          throw new Error('Unknown message send back from from DAPI (subscribeToTransactionsWithProofs)')
      }
    }

    throw new Error('Unreachable code block in waitForIncomingTransaction')
  }

  async * subscribeToTransactions (addresses: string[], extraFilterData: Uint8Array[] = []): AsyncIterable<SubscribeToTransactionsEvent> {
    const numberOfElements = Math.max(addresses.length + extraFilterData.length, 1)
    const bf = bloomFilter.create(numberOfElements, BLOOM_FILTER_FALSE_POSITIVE_RATE)

    for (const address of addresses) {
      bf.insert(addressToPublicKeyHash(address))
    }

    for (const data of extraFilterData) {
      bf.insert(data)
    }

    // subscribe to new transactions
    const count = 0

    // send transaction hashes
    const sendTransactionHashes = false

    const fromBlockHeight = (await this.getBestBlockHeight()).height
    const abortController = new AbortController()
    const reconnectReason = 'DAPI_RECONNECT_STREAM'

    const iterator = this.subscribeToTransactionsWithProofs({ ...bf.toObject() }, count, sendTransactionHashes, undefined, fromBlockHeight, abortController)

    const reconnectTimeout = setTimeout(() => {
      abortController.abort(reconnectReason)
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
            for (const transactionBytes of responses.rawTransactions.transactions) {
              yield ({
                event: 'rawTransaction',
                data: bytesToHex(transactionBytes)
              })
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
      const message = e instanceof Error ? e.message : undefined

      if (message === reconnectReason || abortController.signal.reason === reconnectReason) {
        return yield * this.subscribeToTransactions(addresses, extraFilterData)
      }

      throw e
    } finally {
      clearTimeout(reconnectTimeout)
    }
  }

  subscribeToTransactionsWithProofs (bloomFilter: BloomFilter, count: number, sendTransactionHashes: boolean, fromBlockHash?: Uint8Array, fromBlockHeight?: number, abortController?: AbortController): ServerStreamingCall<TransactionsWithProofsRequest, TransactionsWithProofsResponse> {
    const client = this.grpcConnectionPool.getClient(abortController)

    if ((fromBlockHash == null && fromBlockHeight == null) || (fromBlockHash != null && fromBlockHeight != null)) {
      throw new Error('Either fromBlockHash or fromBlockHeight must be set')
    }

    let fromBlock: TransactionsWithProofsRequest['fromBlock'] = { oneofKind: undefined }

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
