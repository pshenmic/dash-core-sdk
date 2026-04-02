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
import bloomFilter from 'bloom-filter'
import { BLOOM_FILTER_FALSE_POSITIVE_RATE, DAPI_STREAM_RECONNECT_TIMEOUT, DASH_VERSIONS, FEE_PER_BYTE, MIN_FEE_RELAY, Network, TransactionType } from './constants.js'
import { addressToPublicKeyHash, bytesToHex, hexToBytes, wait } from './utils.js'
import { p2pkh } from '@scure/btc-signer'
import * as secp from '@noble/secp256k1'
import { PrivateKey } from './types/PrivateKey.js'
import { Transaction, type TransactionInputToSign } from './types/Transaction.js'
import { InstantLock } from './types/InstantLock.js'
import { Input } from './types/Input.js'
import { OutPoint } from './types/OutPoint.js'
import { Output } from './types/Output.js'
import { Script } from './types/Script.js'
import type { ServerStreamingCall } from '@protobuf-ts/runtime-rpc'
import {AssetLockTx} from "./types/ExtraPayload/AssetLockTx.js"
import {AssetUnlockTx} from "./types/ExtraPayload/AssetUnlockTx.js"
import {CbTx} from "./types/ExtraPayload/CbTx.js"
import {MnHfTx} from "./types/ExtraPayload/MnHfTx.js"
import {ProRegTX} from "./types/ExtraPayload/ProRegTX.js"
import {ProUpRegTx} from "./types/ExtraPayload/ProUpRegTx.js"
import {ProUpRevTx} from "./types/ExtraPayload/ProUpRevTx.js"
import {ProUpServTx} from "./types/ExtraPayload/ProUpServTx.js"
import {QcTx} from "./types/ExtraPayload/QcTx.js"
import {MnHfSignal} from "./types/Messages/MnHfSignal.js"
import {QfCommit} from "./types/Messages/QfCommit.js"

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

export interface AssetLockSpendableUtxo {
  txid: string
  vout: number
  satoshis: number | bigint
  privateKeyWif: string
}

export interface AssetLockCreditOutput {
  address: string
  amountSatoshis: number | bigint
}

export interface CreateAssetLockTransactionOptions {
  utxos: AssetLockSpendableUtxo[]
  creditOutputs: AssetLockCreditOutput[]
  changeAddress?: string
}

export interface InstantAssetLockProof {
  type: 0
  instantLock: Uint8Array
  transaction: Uint8Array
  outputIndex: number
}

export interface ChainAssetLockProof {
  type: 1
  coreChainLockedHeight: number
  outPoint: OutPoint
}

export {BlockHeader} from "./types/BlockHeader.js"
export {BloomFilterWriter} from "./types/BloomFilter.js"
export {Input} from "./types/Input.js"
export {InstantLock} from "./types/InstantLock.js"
export {MerkleBlock} from "./types/MerkleBlock.js"
export {MerkleTree} from "./types/MerkleTree.js"
export {OutPoint} from "./types/OutPoint.js"
export {Output} from "./types/Output.js"
export {PrivateKey} from "./types/PrivateKey.js"
export {PublicKey} from "./types/PublicKey.js"
export {Script} from "./types/Script.js"
export {Transaction} from "./types/Transaction.js"

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

export {messages as Messages}
export {extraPayload as ExtraPayload}


export class DashCoreSDK {
  grpcConnectionPool: GRPCConnectionPool
  network: 'mainnet' | 'testnet'

  constructor (options: { network?: 'mainnet' | 'testnet', dapiUrl?: string, poolLimit?: number } = {}) {
    this.network = options.network ?? 'testnet'
    this.grpcConnectionPool = new GRPCConnectionPool(this.network, {
      dapiUrl: options.dapiUrl ?? (this.network === 'mainnet' ? 'http://127.0.0.1:443' : 'http://127.0.0.1:1443'),
      poolLimit: options.poolLimit ?? 5
    })
  }

  private getNetworkType (): Network {
    return this.network === 'mainnet' ? Network.Mainnet : Network.Testnet
  }

  private getPaymentAmount (amount: number): bigint {
    if (!Number.isSafeInteger(amount) || amount < 0) {
      throw new Error('Amount must be a non-negative safe integer')
    }

    return BigInt(amount)
  }

  private getSatoshisAmount (amount: number | bigint, fieldName: string): bigint {
    if (typeof amount === 'bigint') {
      if (amount < 0n) {
        throw new Error(`${fieldName} must be a non-negative integer`)
      }

      return amount
    }

    if (!Number.isSafeInteger(amount) || amount < 0) {
      throw new Error(`${fieldName} must be a non-negative safe integer`)
    }

    return BigInt(amount)
  }

  private getOutputAddress (output: Output): string | undefined {
    return output.script.getAddress(this.getNetworkType())
  }

  private outputMatchesPayment (output: Output, address: string, amount: bigint): boolean {
    return output.satoshis >= amount && this.getOutputAddress(output) === address
  }

  private transactionMatchesPayment (transaction: Transaction, address: string, amount: bigint): boolean {
    return transaction.outputs.some(output => this.outputMatchesPayment(output, address, amount))
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

    if (!this.transactionMatchesPayment(transactionInfo.transaction, address, amount)) {
      return undefined
    }

    return {
      txid,
      chainLocked: transactionInfo.dapiTransaction.height
    }
  }

  private getRequiredTransactionFee (transaction: Transaction): bigint {
    return BigInt(Math.max(MIN_FEE_RELAY, transaction.bytes().byteLength * FEE_PER_BYTE))
  }

  private rebalanceTransactionFee (transaction: Transaction, totalInputAmount: bigint, signingInputs: TransactionInputToSign[]): void {
    while (true) {
      transaction.signInputs(signingInputs)

      const fee = totalInputAmount - transaction.getOutputAmount()
      const requiredFee = this.getRequiredTransactionFee(transaction)

      if (fee >= requiredFee) {
        return
      }

      if (transaction.outputs.length < 2) {
        throw new Error(`Insufficient fee for asset lock transaction: got ${fee.toString()} satoshis, expected at least ${requiredFee.toString()} satoshis`)
      }

      const missingFee = requiredFee - fee
      const changeOutputIndex = transaction.outputs.length - 1
      const changeOutput = transaction.outputs[changeOutputIndex]
      const nextChangeAmount = changeOutput.satoshis - missingFee

      if (nextChangeAmount >= BigInt(MIN_FEE_RELAY)) {
        changeOutput.satoshis = nextChangeAmount
        continue
      }

      transaction.outputs.splice(changeOutputIndex, 1)
    }
  }

  private normalizeTransactionBytes (transaction: Transaction | Uint8Array | string): Uint8Array {
    if (transaction instanceof Transaction) {
      return transaction.bytes()
    }

    if (typeof transaction === 'string') {
      return hexToBytes(transaction)
    }

    return transaction
  }

  private normalizeInstantLockBytes (instantLock: InstantLock | Uint8Array | string): Uint8Array {
    if (instantLock instanceof InstantLock) {
      return instantLock.bytes()
    }

    if (typeof instantLock === 'string') {
      return hexToBytes(instantLock)
    }

    return instantLock
  }

  private getAssetLockTransactionProofData (transaction: Transaction | Uint8Array | string, outputIndex: number): { transactionBytes: Uint8Array, transactionObject: Transaction, txid: string } {
    if (!Number.isSafeInteger(outputIndex) || outputIndex < 0) {
      throw new Error('outputIndex must be a non-negative safe integer')
    }

    const transactionBytes = this.normalizeTransactionBytes(transaction)
    const transactionObject = Transaction.fromBytes(transactionBytes)

    if (transactionObject.type !== TransactionType.TRANSACTION_ASSET_LOCK || !(transactionObject.extraPayload instanceof AssetLockTx)) {
      throw new Error('Asset lock proof requires an asset lock transaction')
    }

    if (outputIndex >= transactionObject.extraPayload.outputs.length) {
      throw new Error(`outputIndex must be lower than the number of asset lock credit outputs (${transactionObject.extraPayload.outputs.length})`)
    }

    return {
      transactionBytes,
      transactionObject,
      txid: transactionObject.hash()
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

  async getEstimatedTransactionFee (blocks: number): Promise<GetEstimatedTransactionFeeResponse> {
    const client = this.grpcConnectionPool.getClient()

    return (await client.getEstimatedTransactionFee(GetEstimatedTransactionFeeRequest.fromJson({ blocks }))).response
  }

  createAssetLockTransaction (options: CreateAssetLockTransactionOptions): Transaction {
    if (options.utxos.length === 0) {
      throw new Error('At least one UTXO is required to build an asset lock transaction')
    }

    if (options.creditOutputs.length === 0) {
      throw new Error('At least one credit output is required to build an asset lock transaction')
    }

    if (options.creditOutputs.length > 255) {
      throw new Error('Asset lock transactions support at most 255 credit outputs')
    }

    const payloadOutputs = options.creditOutputs.map((creditOutput, index) => {
      const amount = this.getSatoshisAmount(creditOutput.amountSatoshis, `Credit output amount at index ${index}`)

      if (amount === 0n) {
        throw new Error(`Credit output amount at index ${index} must be greater than 0`)
      }

      return Output.createP2PKH(amount, creditOutput.address)
    })

    const lockedAmount = payloadOutputs.reduce((acc, output) => acc + output.satoshis, 0n)

    const transaction = new Transaction(
      [],
      [Output.createAssetLockBurn(lockedAmount)],
      undefined,
      undefined,
      TransactionType.TRANSACTION_ASSET_LOCK,
      new AssetLockTx(1, payloadOutputs.length, payloadOutputs)
    )

    let totalInputAmount = 0n
    const signingInputs: TransactionInputToSign[] = []

    for (let i = 0; i < options.utxos.length; i++) {
      const utxo = options.utxos[i]
      const amount = this.getSatoshisAmount(utxo.satoshis, `UTXO amount at index ${i}`)
      const privateKey = PrivateKey.fromWIF(utxo.privateKeyWif)

      if (privateKey.network !== this.getNetworkType()) {
        throw new Error(`UTXO private key at index ${i} does not match SDK network`)
      }

      totalInputAmount += amount
      transaction.addInput(new Input(utxo.txid, utxo.vout, new Script(), 0))

      signingInputs.push({
        inputIndex: i,
        privateKey,
        lockingScript: Output.createP2PKH(0n, privateKey.getAddress()).script
      })
    }

    if (totalInputAmount <= lockedAmount) {
      throw new Error('UTXO amount must be greater than locked amount to pay the transaction fee')
    }

    const changeAddress = options.changeAddress ?? signingInputs[0].privateKey.getAddress()

    transaction.generateChange(changeAddress, totalInputAmount)
    this.rebalanceTransactionFee(transaction, totalInputAmount, signingInputs)

    return transaction
  }

  createInstantAssetLockProof (transaction: Transaction | Uint8Array | string, instantLock: InstantLock | Uint8Array | string, outputIndex: number = 0): InstantAssetLockProof {
    const { transactionBytes, txid } = this.getAssetLockTransactionProofData(transaction, outputIndex)

    const instantLockBytes = this.normalizeInstantLockBytes(instantLock)
    const instantLockObject = InstantLock.fromBytes(instantLockBytes)

    if (instantLockObject.txId !== txid) {
      throw new Error(`InstantLock txid ${instantLockObject.txId} does not match transaction txid ${txid}`)
    }

    return {
      type: 0,
      instantLock: instantLockBytes,
      transaction: transactionBytes,
      outputIndex
    }
  }

  createChainAssetLockProof (transaction: Transaction | Uint8Array | string, coreChainLockedHeight: number, outputIndex: number = 0): ChainAssetLockProof {
    if (!Number.isSafeInteger(coreChainLockedHeight) || coreChainLockedHeight < 0) {
      throw new Error('coreChainLockedHeight must be a non-negative safe integer')
    }

    const { txid } = this.getAssetLockTransactionProofData(transaction, outputIndex)

    return {
      type: 1,
      coreChainLockedHeight,
      outPoint: new OutPoint(txid, outputIndex)
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

  async waitForPayment (address: string, amount: number = 1000): Promise<PaymentInfo> {
    const paymentAmount = this.getPaymentAmount(amount)
    const pendingTransactions = new Map<string, Transaction>()
    const pendingInstantLocks = new Map<string, string>()

    const iterator = this.subscribeToTransactions([address])

    for await (const event of iterator) {
      switch (event.event) {
        case 'rawMerkleBlock': {
          await wait(5000)

          for (const txid of pendingTransactions.keys()) {
            const paymentInfo = await this.getChainLockedPaymentInfo(txid, address, paymentAmount)

            if (paymentInfo != null) {
              return paymentInfo
            }
          }
          break
        }
        case 'rawTransaction': {
          const transaction = Transaction.fromBytes(hexToBytes(event.data))

          if (!this.transactionMatchesPayment(transaction, address, paymentAmount)) {
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

    throw new Error('Unreachable code block in waitForPayment')
  }

  async * subscribeToTransactions (addresses: string[]): AsyncIterable<SubscribeToTransactionsEvent> {
    const numberOfElements = Math.max(addresses.length, 1)
    const bf = bloomFilter.create(numberOfElements, BLOOM_FILTER_FALSE_POSITIVE_RATE)

    for (const address of addresses) {
      bf.insert(addressToPublicKeyHash(address))
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
      if (e?.message === reconnectReason || abortController.signal.reason === reconnectReason) {
        return yield * this.subscribeToTransactions(addresses)
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
