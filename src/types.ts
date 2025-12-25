import {Network, TransactionType} from './constants.js'
import {ProRegTX} from "./types/ExtraPayload/ProRegTX.js";
import {CbTx} from "./types/ExtraPayload/CbTx.js";
import {ProUpRevTx} from "./types/ExtraPayload/ProUpRevTx.js";
import {ProUpRegTx} from "./types/ExtraPayload/ProUpRegTx.js";
import {ProUpServTx} from "./types/ExtraPayload/ProUpServTx.js";
import {QcTx} from "./types/ExtraPayload/QcTx.js";
import {MnHfTx} from "./types/ExtraPayload/MnHfTx.js";

export interface ScriptChunk {
  opcode: number
  data?: ArrayBuffer
}

export type NetworkLike = Network | keyof typeof Network

export type ExtraPayload = ProRegTX | ProUpServTx | ProUpRegTx | ProUpRevTx | CbTx | QcTx | MnHfTx

export interface TransactionJSON {
  version: number
  type: TransactionType
  nLockTime: number
  inputs: InputJSON[]
  outputs: OutputJSON[]
  extraPayload: ProRegTxJSON | ProUpRegTxJSON | ProUpRevTxJSON | ProUpServTxJSON | CbTxJSON | QcTxJSON | MnHfTxJSON | null
}

export interface OutPointJSON {
  txId: string
  vOut: number
}

export interface InstantLockJSON {
  version: number
  inputs: OutPointJSON[]
  txId: string
  cycleHash: string
  signature: string
}

export interface BlockHeaderJSON {
  version: number
  previousBlockHash: string
  merkleRoot: string
  time: number
  nBits: number
  nonce: number
}

export interface InputJSON {
  txId: string
  vOut: number
  scriptSig: string
  sequence: number
}

export interface MerkleTreeJSON {
  transactionCount: number
  hashes: string[]
  flags: boolean[]
}

export interface MerkleBlockJSON {
  blockHeader: BlockHeaderJSON
  merkleTree: MerkleTreeJSON
}

export interface OutputJSON {
  satoshis: string
  script: string
}

export interface PublicKeyJSON {
  inner: string
  compressed: boolean
}

export interface ProRegTxJSON {
  version: number;
  type: number;
  mode: number;
  collateralOutpoint: OutPointJSON;
  ipAddress: string;
  port: number;

  keyIdOwner: string;
  keyIdVoting: string;
  pubKeyOperator: string;
  operatorReward: number;
  scriptPayout: string;
  inputsHash: string;
  platformNodeID?: string;
  platformP2PPort?: number;
  platformHTTPPort?: number;
  payloadSig?: string;
}

export interface ProUpServTxJSON {
  version: number;
  type: number;
  proTxHash: string;
  ipAddress: string;
  port: number;

  scriptOperatorPayout: string;
  inputsHash: string;
  platformNodeID?: string;
  platformP2PPort?: number;
  platformHTTPPort?: number;

  payloadSig: string;
}

export interface ProUpRegTxJSON {
  version: number;
  proTxHash: string;
  mode: number;
  keyIdVoting: string;
  pubKeyOperator: string;
  scriptPayout: string;
  inputsHash: string;
  payloadSig: string;
}

export interface ProUpRevTxJSON {
  version: number;
  proTxHash: string;
  reason: number;
  inputsHash: string;
  payloadSig: string;
}

export interface CbTxJSON {
  version: number;
  height: number;
  merkleRootMNList: string;
  merkleRootQuorums: string | null;
  bestCLHeightDiff: string | null;
  bestCLSignature: string | null;
  creditPoolBalance: string | null;
}

export interface QcTxJSON {
  version: number;
  height: number;
  commitment: QfCommitJSON
}

export interface MnHfTxJSON {
  version: number;
  commitment: MnHfSignalJSON;
}


export interface QfCommitJSON {
  version: number;
  llmqType: number;
  quorumHash: string;
  quorumIndex: number | null;
  signers: string;
  validMembers: string;
  quorumPublicKey: string;
  quorumVvecHash: string;
  quorumSig: string;
  sig: string;
}

export interface MnHfSignalJSON {
  versionBit: number;
  quorumHash: string;
  sig: string;
}