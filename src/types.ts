import { Network, TransactionType } from './constants.js'
import { ProRegTX } from './types/ExtraPayload/ProRegTX.js'
import { CbTx } from './types/ExtraPayload/CbTx.js'
import { ProUpRevTx } from './types/ExtraPayload/ProUpRevTx.js'
import { ProUpRegTx } from './types/ExtraPayload/ProUpRegTx.js'
import { ProUpServTx } from './types/ExtraPayload/ProUpServTx.js'
import { QcTx } from './types/ExtraPayload/QcTx.js'
import { MnHfTx } from './types/ExtraPayload/MnHfTx.js'
import { AssetLockTx } from './types/ExtraPayload/AssetLockTx.js'
import { AssetUnlockTx } from './types/ExtraPayload/AssetUnlockTx.js'
import { ProDisTx } from './types/ExtraPayload/ProDisTx.js'
import { ProUpShareTx } from './types/ExtraPayload/ProUpShareTx.js'
import { ProUpSharedRegTx } from './types/ExtraPayload/ProUpSharedRegTx.js'

export interface ScriptChunk {
  opcode: number
  data?: ArrayBuffer
}

// Accept lowercase variants too: networkValueToEnumValue already normalises
// case at runtime (uses .toLowerCase()), but the type artificially rejected
// the lowercase form callers commonly carry around.
export type NetworkLike = Network | keyof typeof Network | Lowercase<keyof typeof Network>

export type ExtraPayload =
  ProRegTX
  | ProUpServTx
  | ProUpRegTx
  | ProUpRevTx
  | CbTx
  | QcTx
  | MnHfTx
  | AssetLockTx
  | AssetUnlockTx
  | ProDisTx
  | ProUpShareTx
  | ProUpSharedRegTx

export interface TransactionJSON {
  version: number
  type: TransactionType
  nLockTime: number
  inputs: InputJSON[]
  outputs: OutputJSON[]
  hash: string
  // only for version 2+ asset unlocks, hash of the full serialization
  instanceHash?: string
  extraPayload: ProRegTxJSON
  | ProUpRegTxJSON
  | ProUpRevTxJSON
  | ProUpServTxJSON
  | CbTxJSON
  | QcTxJSON
  | MnHfTxJSON
  | AssetLockTxJSON
  | AssetUnlockTxJSON
  | ProDisTxJSON
  | ProUpShareTxJSON
  | ProUpSharedRegTxJSON
  | null
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

export interface BlockJSON {
  blockHeader: BlockHeaderJSON
  txCount: number
  txs: TransactionJSON[]
  hash: string
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
  version: number
  type: number
  mode: number
  collateralOutpoint: OutPointJSON
  ipAddress: string
  port: number

  keyIdOwner: string
  keyIdVoting: string
  pubKeyOperator: string
  operatorReward: number
  scriptPayout: string
  inputsHash: string
  platformNodeID?: string
  platformP2PPort?: number
  platformHTTPPort?: number
  payloadSig?: string
  // only for version >= 3
  netInfo?: ExtNetInfoJSON
  payouts?: PayoutShareJSON[]
  shares?: CollateralShareJSON[]
  joinSigs?: string[]
  earlyPeriodBlocks?: number
  earlyPenalty?: string
}

export interface ProUpServTxJSON {
  version: number
  type: number
  proTxHash: string
  ipAddress: string
  port: number

  scriptOperatorPayout: string
  inputsHash: string
  platformNodeID?: string
  platformP2PPort?: number
  platformHTTPPort?: number
  // only for version >= 3
  netInfo?: ExtNetInfoJSON

  payloadSig: string
}

export interface ProUpRegTxJSON {
  version: number
  proTxHash: string
  mode: number
  keyIdVoting: string
  pubKeyOperator: string
  scriptPayout: string
  inputsHash: string
  payloadSig: string
  // only for version >= 3
  payouts?: PayoutShareJSON[]
}

export interface NetInfoEntryJSON {
  type: number
  network: number | null
  address: string | null
  port: number | null
}

export interface ExtNetInfoJSON {
  version: number
  entries: Record<string, NetInfoEntryJSON[]>
}

export interface PayoutShareJSON {
  scriptPayout: string
  reward: number
}

export interface CollateralShareJSON {
  amount: string
  scriptRefund: string
  scriptReward: string
  keyIdOwner: string
}

export interface ProUpRevTxJSON {
  version: number
  proTxHash: string
  reason: number
  inputsHash: string
  payloadSig: string
}

export interface ProDisTxJSON {
  version: number
  proTxHash: string
  actorIndex: number
  sigs: string[]
}

export interface ProUpShareTxJSON {
  version: number
  proTxHash: string
  shareIndex: number
  scriptReward: string
  inputsHash: string
  payloadSig: string
}

export interface ProUpSharedRegTxJSON {
  version: number
  proTxHash: string
  pubKeyOperator: string
  keyIdVoting: string
  inputsHash: string
  sigs: string[]
}

export interface CbTxJSON {
  version: number
  height: number
  merkleRootMNList: string
  merkleRootQuorums: string | null
  bestCLHeightDiff: string | null
  bestCLSignature: string | null
  creditPoolBalance: string | null
  merkleRootAssetUnlocks: string | null
}

export interface QcTxJSON {
  version: number
  height: number
  commitment: QfCommitJSON
}

export interface MnHfTxJSON {
  version: number
  commitment: MnHfSignalJSON
}

export interface AssetLockTxJSON {
  version: number
  count: number
  outputs: OutputJSON[]
}

export interface AssetUnlockTxJSON {
  version: number
  index: string
  fee: number
  requestedHeight: number
  quorumHash: string
  quorumSig: string

}

export interface QfCommitJSON {
  version: number
  llmqType: number
  quorumHash: string
  quorumIndex: number | null
  signers: string
  validMembers: string
  quorumPublicKey: string
  quorumVvecHash: string
  quorumSig: string
  sig: string
}

export interface MnHfSignalJSON {
  versionBit: number
  quorumHash: string
  sig: string
}
