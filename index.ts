import { DashCoreSDK, ExtraPayload, Messages } from './src/DashCoreSDK.js'
import { BlockJSON, TransactionJSON } from './src/types.js'
import { Block } from './src/types/Block.js'
import { BlockHeader } from './src/types/BlockHeader.js'
import { BloomFilterWriter } from './src/types/BloomFilter.js'
import { CollateralShare } from './src/types/CollateralShare.js'
import { ExtNetInfo, NetInfoEntryType, NetInfoPurpose } from './src/types/ExtNetInfo.js'
import { Input } from './src/types/Input.js'
import { InstantLock } from './src/types/InstantLock.js'
import { MerkleBlock } from './src/types/MerkleBlock.js'
import { MerkleTree } from './src/types/MerkleTree.js'
import { OutPoint } from './src/types/OutPoint.js'
import { Output } from './src/types/Output.js'
import { PayoutShare } from './src/types/PayoutShare.js'
import { PrivateKey } from './src/types/PrivateKey.js'
import { PublicKey } from './src/types/PublicKey.js'
import { Script } from './src/types/Script.js'
import { Transaction } from './src/types/Transaction.js'
import { GovernanceObject } from './src/types/Governance/GovernanceObject.js'
import { GovernanceVote } from './src/types/Governance/GovernanceVote.js'
import {
  CbTxVersion,
  GovernanceObjectType,
  isCbTxV24,
  MasternodeKeyRole,
  Network,
  TransactionType,
  VoteOutcome,
  VoteSignal
} from './src/constants.js'
import { messageHash, recoverHashSigner, recoverMessageSigner, signHash, signMessage } from './src/signing.js'
import * as bls from './src/bls.js'
import * as utils from './src/utils.js'

export {
  DashCoreSDK,
  BlockHeader,
  Block,
  BlockJSON,
  ExtraPayload,
  Messages,
  BloomFilterWriter,
  bls,
  CbTxVersion,
  CollateralShare,
  ExtNetInfo,
  GovernanceObject,
  GovernanceObjectType,
  GovernanceVote,
  Input,
  isCbTxV24,
  InstantLock,
  MerkleBlock,
  MasternodeKeyRole,
  MerkleTree,
  messageHash,
  Network,
  NetInfoEntryType,
  NetInfoPurpose,
  OutPoint,
  Output,
  PayoutShare,
  PrivateKey,
  PublicKey,
  recoverHashSigner,
  recoverMessageSigner,
  Script,
  signHash,
  signMessage,
  Transaction,
  TransactionJSON,
  TransactionType,
  utils,
  VoteOutcome,
  VoteSignal
}

export type { GovernanceObjectJSON, GovernanceProposal, GovernanceVoteJSON } from './src/types.js'
export type { BlsExtendedKey, BlsKeyPair, BlsOperatorAccount } from './src/bls.js'

export type {
  BloomFilter,
  CoreKeyPair,
  PaymentInfo,
  SubscribeToTransactionsEvent
} from './src/DashCoreSDK.js'
