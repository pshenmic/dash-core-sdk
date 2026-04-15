import type { RpcTransport } from "@protobuf-ts/runtime-rpc";
import type { ServiceInfo } from "@protobuf-ts/runtime-rpc";
import type { MasternodeListResponse } from "./core.js";
import type { MasternodeListRequest } from "./core.js";
import type { TransactionsWithProofsResponse } from "./core.js";
import type { TransactionsWithProofsRequest } from "./core.js";
import type { BlockHeadersWithChainLocksResponse } from "./core.js";
import type { BlockHeadersWithChainLocksRequest } from "./core.js";
import type { ServerStreamingCall } from "@protobuf-ts/runtime-rpc";
import type { GetEstimatedTransactionFeeResponse } from "./core.js";
import type { GetEstimatedTransactionFeeRequest } from "./core.js";
import type { GetTransactionResponse } from "./core.js";
import type { GetTransactionRequest } from "./core.js";
import type { BroadcastTransactionResponse } from "./core.js";
import type { BroadcastTransactionRequest } from "./core.js";
import type { GetBestBlockHeightResponse } from "./core.js";
import type { GetBestBlockHeightRequest } from "./core.js";
import type { GetBlockResponse } from "./core.js";
import type { GetBlockRequest } from "./core.js";
import type { GetMasternodeStatusResponse } from "./core.js";
import type { GetMasternodeStatusRequest } from "./core.js";
import type { GetBlockchainStatusResponse } from "./core.js";
import type { GetBlockchainStatusRequest } from "./core.js";
import type { UnaryCall } from "@protobuf-ts/runtime-rpc";
import type { RpcOptions } from "@protobuf-ts/runtime-rpc";
/**
 * @generated from protobuf service org.dash.platform.dapi.v0.Core
 */
export interface ICoreClient {
    /**
     * @generated from protobuf rpc: getBlockchainStatus
     */
    getBlockchainStatus(input: GetBlockchainStatusRequest, options?: RpcOptions): UnaryCall<GetBlockchainStatusRequest, GetBlockchainStatusResponse>;
    /**
     * @generated from protobuf rpc: getMasternodeStatus
     */
    getMasternodeStatus(input: GetMasternodeStatusRequest, options?: RpcOptions): UnaryCall<GetMasternodeStatusRequest, GetMasternodeStatusResponse>;
    /**
     * @generated from protobuf rpc: getBlock
     */
    getBlock(input: GetBlockRequest, options?: RpcOptions): UnaryCall<GetBlockRequest, GetBlockResponse>;
    /**
     * @generated from protobuf rpc: getBestBlockHeight
     */
    getBestBlockHeight(input: GetBestBlockHeightRequest, options?: RpcOptions): UnaryCall<GetBestBlockHeightRequest, GetBestBlockHeightResponse>;
    /**
     * @generated from protobuf rpc: broadcastTransaction
     */
    broadcastTransaction(input: BroadcastTransactionRequest, options?: RpcOptions): UnaryCall<BroadcastTransactionRequest, BroadcastTransactionResponse>;
    /**
     * @generated from protobuf rpc: getTransaction
     */
    getTransaction(input: GetTransactionRequest, options?: RpcOptions): UnaryCall<GetTransactionRequest, GetTransactionResponse>;
    /**
     * @generated from protobuf rpc: getEstimatedTransactionFee
     */
    getEstimatedTransactionFee(input: GetEstimatedTransactionFeeRequest, options?: RpcOptions): UnaryCall<GetEstimatedTransactionFeeRequest, GetEstimatedTransactionFeeResponse>;
    /**
     * @generated from protobuf rpc: subscribeToBlockHeadersWithChainLocks
     */
    subscribeToBlockHeadersWithChainLocks(input: BlockHeadersWithChainLocksRequest, options?: RpcOptions): ServerStreamingCall<BlockHeadersWithChainLocksRequest, BlockHeadersWithChainLocksResponse>;
    /**
     * @generated from protobuf rpc: subscribeToTransactionsWithProofs
     */
    subscribeToTransactionsWithProofs(input: TransactionsWithProofsRequest, options?: RpcOptions): ServerStreamingCall<TransactionsWithProofsRequest, TransactionsWithProofsResponse>;
    /**
     * @generated from protobuf rpc: subscribeToMasternodeList
     */
    subscribeToMasternodeList(input: MasternodeListRequest, options?: RpcOptions): ServerStreamingCall<MasternodeListRequest, MasternodeListResponse>;
}
/**
 * @generated from protobuf service org.dash.platform.dapi.v0.Core
 */
export declare class CoreClient implements ICoreClient, ServiceInfo {
    private readonly _transport;
    typeName: string;
    methods: import("@protobuf-ts/runtime-rpc").MethodInfo<any, any>[];
    options: {
        [extensionName: string]: import("@protobuf-ts/runtime").JsonValue;
    };
    constructor(_transport: RpcTransport);
    /**
     * @generated from protobuf rpc: getBlockchainStatus
     */
    getBlockchainStatus(input: GetBlockchainStatusRequest, options?: RpcOptions): UnaryCall<GetBlockchainStatusRequest, GetBlockchainStatusResponse>;
    /**
     * @generated from protobuf rpc: getMasternodeStatus
     */
    getMasternodeStatus(input: GetMasternodeStatusRequest, options?: RpcOptions): UnaryCall<GetMasternodeStatusRequest, GetMasternodeStatusResponse>;
    /**
     * @generated from protobuf rpc: getBlock
     */
    getBlock(input: GetBlockRequest, options?: RpcOptions): UnaryCall<GetBlockRequest, GetBlockResponse>;
    /**
     * @generated from protobuf rpc: getBestBlockHeight
     */
    getBestBlockHeight(input: GetBestBlockHeightRequest, options?: RpcOptions): UnaryCall<GetBestBlockHeightRequest, GetBestBlockHeightResponse>;
    /**
     * @generated from protobuf rpc: broadcastTransaction
     */
    broadcastTransaction(input: BroadcastTransactionRequest, options?: RpcOptions): UnaryCall<BroadcastTransactionRequest, BroadcastTransactionResponse>;
    /**
     * @generated from protobuf rpc: getTransaction
     */
    getTransaction(input: GetTransactionRequest, options?: RpcOptions): UnaryCall<GetTransactionRequest, GetTransactionResponse>;
    /**
     * @generated from protobuf rpc: getEstimatedTransactionFee
     */
    getEstimatedTransactionFee(input: GetEstimatedTransactionFeeRequest, options?: RpcOptions): UnaryCall<GetEstimatedTransactionFeeRequest, GetEstimatedTransactionFeeResponse>;
    /**
     * @generated from protobuf rpc: subscribeToBlockHeadersWithChainLocks
     */
    subscribeToBlockHeadersWithChainLocks(input: BlockHeadersWithChainLocksRequest, options?: RpcOptions): ServerStreamingCall<BlockHeadersWithChainLocksRequest, BlockHeadersWithChainLocksResponse>;
    /**
     * @generated from protobuf rpc: subscribeToTransactionsWithProofs
     */
    subscribeToTransactionsWithProofs(input: TransactionsWithProofsRequest, options?: RpcOptions): ServerStreamingCall<TransactionsWithProofsRequest, TransactionsWithProofsResponse>;
    /**
     * @generated from protobuf rpc: subscribeToMasternodeList
     */
    subscribeToMasternodeList(input: MasternodeListRequest, options?: RpcOptions): ServerStreamingCall<MasternodeListRequest, MasternodeListResponse>;
}
