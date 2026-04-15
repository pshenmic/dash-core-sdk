import GRPCConnectionPool from './grpcConnectionPool.js';
import { BroadcastTransactionRequest, GetBestBlockHeightRequest, GetBlockchainStatusRequest, GetBlockRequest, GetEstimatedTransactionFeeRequest, GetMasternodeStatusRequest, GetTransactionRequest, MasternodeListRequest, TransactionsWithProofsRequest } from '../proto/generated/core.js';
import bloomFilter from 'bloom-filter';
import { BLOOM_FILTER_FALSE_POSITIVE_RATE, DAPI_STREAM_RECONNECT_TIMEOUT, DASH_VERSIONS, Network, TransactionType } from './constants.js';
import { addressToPublicKeyHash, bytesToHex, hexToBytes, wait } from './utils.js';
import { p2pkh } from '@scure/btc-signer';
import * as secp from '@noble/secp256k1';
import { PrivateKey } from './types/PrivateKey.js';
import { Transaction } from './types/Transaction.js';
import { InstantLock } from './types/InstantLock.js';
import { OutPoint } from './types/OutPoint.js';
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
};
const messages = {
    MnHfSignal,
    QfCommit
};
export { messages as Messages };
export { extraPayload as ExtraPayload };
export class DashCoreSDK {
    grpcConnectionPool;
    network;
    constructor(options = {}) {
        this.network = options.network ?? 'testnet';
        this.grpcConnectionPool = new GRPCConnectionPool(this.network, {
            dapiUrl: options.dapiUrl ?? (this.network === 'mainnet' ? 'http://127.0.0.1:443' : 'http://127.0.0.1:1443'),
            poolLimit: options.poolLimit ?? 5
        });
    }
    getNetworkType() {
        return this.network === 'mainnet' ? Network.Mainnet : Network.Testnet;
    }
    getPaymentAmount(amount) {
        if (!Number.isSafeInteger(amount) || amount < 0) {
            throw new Error('Amount must be a non-negative safe integer');
        }
        return BigInt(amount);
    }
    getOutputAddress(output) {
        return output.script.getAddress(this.getNetworkType());
    }
    outputMatchesPayment(output, address, amount) {
        return output.satoshis >= amount && this.getOutputAddress(output) === address;
    }
    transactionMatchesPayment(transaction, address, amount) {
        return transaction.outputs.some(output => this.outputMatchesPayment(output, address, amount));
    }
    async getVerifiedTransaction(txid) {
        try {
            const dapiTransaction = await this.getTransaction(txid);
            const transaction = Transaction.fromBytes(dapiTransaction.transaction);
            if (transaction.hash() !== txid) {
                return undefined;
            }
            return { dapiTransaction, transaction };
        }
        catch {
            return undefined;
        }
    }
    async getChainLockedPaymentInfo(txid, address, amount) {
        const transactionInfo = await this.getVerifiedTransaction(txid);
        if (transactionInfo == null || !transactionInfo.dapiTransaction.isChainLocked) {
            return undefined;
        }
        if (!this.transactionMatchesPayment(transactionInfo.transaction, address, amount)) {
            return undefined;
        }
        return {
            txid,
            chainLocked: transactionInfo.dapiTransaction.height
        };
    }
    normalizeTransactionBytes(transaction) {
        if (transaction instanceof Transaction) {
            return transaction.bytes();
        }
        if (typeof transaction === 'string') {
            return hexToBytes(transaction);
        }
        return transaction;
    }
    normalizeInstantLockBytes(instantLock) {
        if (instantLock instanceof InstantLock) {
            return instantLock.bytes();
        }
        if (typeof instantLock === 'string') {
            return hexToBytes(instantLock);
        }
        return instantLock;
    }
    getAssetLockTransactionProofData(transaction, outputIndex) {
        if (!Number.isSafeInteger(outputIndex) || outputIndex < 0) {
            throw new Error('outputIndex must be a non-negative safe integer');
        }
        const transactionBytes = this.normalizeTransactionBytes(transaction);
        const transactionObject = Transaction.fromBytes(transactionBytes);
        if (transactionObject.type !== TransactionType.TRANSACTION_ASSET_LOCK || !(transactionObject.extraPayload instanceof AssetLockTx)) {
            throw new Error('Asset lock proof requires an asset lock transaction');
        }
        if (outputIndex >= transactionObject.extraPayload.outputs.length) {
            throw new Error(`outputIndex must be lower than the number of asset lock credit outputs (${transactionObject.extraPayload.outputs.length})`);
        }
        return {
            transactionBytes,
            transactionObject,
            txid: transactionObject.hash()
        };
    }
    async generateAddress() {
        const { secretKey, publicKey } = secp.keygen();
        const networkType = this.getNetworkType();
        const P2PKH = p2pkh(publicKey, DASH_VERSIONS[this.network]);
        return {
            wif: PrivateKey.fromBytes(secretKey, networkType).toWIF(),
            address: P2PKH.address
        };
    }
    async getTransaction(txid) {
        const client = this.grpcConnectionPool.getClient();
        return (await client.getTransaction(GetTransactionRequest.fromJson({ id: txid }))).response;
    }
    async getBlockchainStatus() {
        const client = this.grpcConnectionPool.getClient();
        return (await client.getBlockchainStatus(GetBlockchainStatusRequest.fromJson({}))).response;
    }
    async getMasternodeStatus() {
        const client = this.grpcConnectionPool.getClient();
        return (await client.getMasternodeStatus(GetMasternodeStatusRequest.fromJson({}))).response;
    }
    async getBlock({ hash, height }) {
        if (hash == null && height == null) {
            throw new Error('Hash or height cannot be undefined or null');
        }
        const client = this.grpcConnectionPool.getClient();
        const req = {};
        if (hash != null) {
            req.hash = hash;
        }
        else {
            req.height = height;
        }
        return (await client.getBlock(GetBlockRequest.fromJson({ ...req }))).response;
    }
    async getBestBlockHeight() {
        const client = this.grpcConnectionPool.getClient();
        return (await client.getBestBlockHeight(GetBestBlockHeightRequest.fromJson({}))).response;
    }
    async broadcastTransaction(transaction, allowHighFees, bypassLimits) {
        const client = this.grpcConnectionPool.getClient();
        return (await client.broadcastTransaction(BroadcastTransactionRequest.create({
            transaction,
            allowHighFees: allowHighFees ?? false,
            bypassLimits: bypassLimits ?? false
        }))).response;
    }
    async getEstimatedTransactionFee(blocks) {
        const client = this.grpcConnectionPool.getClient();
        return (await client.getEstimatedTransactionFee(GetEstimatedTransactionFeeRequest.fromJson({ blocks }))).response;
    }
    /**
     * Builds a Core-level instant asset lock proof payload.
     * This uses a numeric `type` field and is not directly compatible
     * with dash-platform-sdk identity create parameters.
     */
    createInstantAssetLockProof(transaction, instantLock, outputIndex = 0) {
        const { transactionBytes, txid } = this.getAssetLockTransactionProofData(transaction, outputIndex);
        const instantLockBytes = this.normalizeInstantLockBytes(instantLock);
        const instantLockObject = InstantLock.fromBytes(instantLockBytes);
        if (instantLockObject.txId !== txid) {
            throw new Error(`InstantLock txid ${instantLockObject.txId} does not match transaction txid ${txid}`);
        }
        return {
            type: 0,
            instantLock: instantLockBytes,
            transaction: transactionBytes,
            outputIndex
        };
    }
    /**
     * Builds a Core-level chain asset lock proof payload.
     * This uses a numeric `type` field and is not directly compatible
     * with dash-platform-sdk identity create parameters.
     */
    createChainAssetLockProof(transaction, coreChainLockedHeight, outputIndex = 0) {
        if (!Number.isSafeInteger(coreChainLockedHeight) || coreChainLockedHeight < 0) {
            throw new Error('coreChainLockedHeight must be a non-negative safe integer');
        }
        const { txid } = this.getAssetLockTransactionProofData(transaction, outputIndex);
        return {
            type: 1,
            coreChainLockedHeight,
            outPoint: new OutPoint(txid, outputIndex)
        };
    }
    toInstantAssetLockProofParams(proof) {
        return {
            type: 'instantLock',
            instantLock: bytesToHex(proof.instantLock),
            transaction: bytesToHex(proof.transaction),
            outputIndex: proof.outputIndex
        };
    }
    toChainAssetLockProofParams(proof) {
        return {
            type: 'chainLock',
            txid: proof.outPoint.txId,
            outputIndex: proof.outPoint.vOut,
            coreChainLockedHeight: proof.coreChainLockedHeight
        };
    }
    subscribeToBlockHeadersWithChainLocks(count = 0, fromBlockHash, fromBlockHeight) {
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
    async waitForIncomingTransaction(address, amount = 1000) {
        const paymentAmount = this.getPaymentAmount(amount);
        const pendingTransactions = new Map();
        const pendingInstantLocks = new Map();
        const iterator = this.subscribeToTransactions([address]);
        for await (const event of iterator) {
            switch (event.event) {
                case 'rawMerkleBlock': {
                    await wait(5000);
                    for (const txid of pendingTransactions.keys()) {
                        const paymentInfo = await this.getChainLockedPaymentInfo(txid, address, paymentAmount);
                        if (paymentInfo != null) {
                            return paymentInfo;
                        }
                    }
                    break;
                }
                case 'rawTransaction': {
                    const transaction = Transaction.fromBytes(hexToBytes(event.data));
                    if (!this.transactionMatchesPayment(transaction, address, paymentAmount)) {
                        break;
                    }
                    const txid = transaction.hash();
                    pendingTransactions.set(txid, transaction);
                    const pendingInstantLock = pendingInstantLocks.get(txid);
                    if (pendingInstantLock != null) {
                        return {
                            txid,
                            instantLocked: pendingInstantLock
                        };
                    }
                    break;
                }
                case 'instantSendLockMessage': {
                    const instantSendLock = InstantLock.fromHex(event.data);
                    if (pendingTransactions.has(instantSendLock.txId)) {
                        return {
                            txid: instantSendLock.txId,
                            instantLocked: event.data
                        };
                    }
                    pendingInstantLocks.set(instantSendLock.txId, event.data);
                    break;
                }
                default:
                    throw new Error('Unknown message send back from from DAPI (subscribeToTransactionsWithProofs)');
            }
        }
        throw new Error('Unreachable code block in waitForIncomingTransaction');
    }
    async *subscribeToTransactions(addresses) {
        const numberOfElements = Math.max(addresses.length, 1);
        const bf = bloomFilter.create(numberOfElements, BLOOM_FILTER_FALSE_POSITIVE_RATE);
        for (const address of addresses) {
            bf.insert(addressToPublicKeyHash(address));
        }
        // subscribe to new transactions
        const count = 0;
        // send transaction hashes
        const sendTransactionHashes = false;
        const fromBlockHeight = (await this.getBestBlockHeight()).height;
        const abortController = new AbortController();
        const reconnectReason = 'DAPI_RECONNECT_STREAM';
        const iterator = this.subscribeToTransactionsWithProofs({ ...bf.toObject() }, count, sendTransactionHashes, undefined, fromBlockHeight, abortController);
        const reconnectTimeout = setTimeout(() => {
            abortController.abort(reconnectReason);
        }, DAPI_STREAM_RECONNECT_TIMEOUT);
        try {
            for await (const event of iterator.responses) {
                const { responses } = event;
                switch (responses.oneofKind) {
                    case 'rawMerkleBlock': {
                        yield ({
                            event: 'rawMerkleBlock',
                            data: bytesToHex(responses.rawMerkleBlock)
                        });
                        break;
                    }
                    case 'rawTransactions': {
                        for (const transactionBytes of responses.rawTransactions.transactions) {
                            yield ({
                                event: 'rawTransaction',
                                data: bytesToHex(transactionBytes)
                            });
                        }
                        break;
                    }
                    case 'instantSendLockMessages': {
                        for (const instantSendLockMessage of responses.instantSendLockMessages.messages) {
                            yield ({
                                event: 'instantSendLockMessage',
                                data: bytesToHex(instantSendLockMessage)
                            });
                        }
                        break;
                    }
                    default:
                        break;
                }
            }
        }
        catch (e) {
            const message = e instanceof Error ? e.message : undefined;
            if (message === reconnectReason || abortController.signal.reason === reconnectReason) {
                return yield* this.subscribeToTransactions(addresses);
            }
            throw e;
        }
        finally {
            clearTimeout(reconnectTimeout);
        }
    }
    subscribeToTransactionsWithProofs(bloomFilter, count, sendTransactionHashes, fromBlockHash, fromBlockHeight, abortController) {
        const client = this.grpcConnectionPool.getClient(abortController);
        if ((fromBlockHash == null && fromBlockHeight == null) || (fromBlockHash != null && fromBlockHeight != null)) {
            throw new Error('Either fromBlockHash or fromBlockHeight must be set');
        }
        let fromBlock = { oneofKind: undefined };
        if (fromBlockHash != null) {
            fromBlock = {
                oneofKind: 'fromBlockHash',
                fromBlockHash
            };
        }
        if (fromBlockHeight != null) {
            fromBlock = {
                oneofKind: 'fromBlockHeight',
                fromBlockHeight
            };
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
        });
        return client.subscribeToTransactionsWithProofs(request);
    }
    subscribeToMasternodeList() {
        const client = this.grpcConnectionPool.getClient();
        const request = MasternodeListRequest.create({});
        return client.subscribeToMasternodeList(request);
    }
}
