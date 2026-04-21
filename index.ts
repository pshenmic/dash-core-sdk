import { DashCoreSDK, ExtraPayload, Messages } from './src/DashCoreSDK.js'
import { BlockJSON, TransactionJSON } from './src/types.js'
import { Block } from './src/types/Block.js'
import { BlockHeader } from './src/types/BlockHeader.js'
import { BloomFilterWriter } from './src/types/BloomFilter.js'
import { Input } from './src/types/Input.js'
import { InstantLock } from './src/types/InstantLock.js'
import { MerkleBlock } from './src/types/MerkleBlock.js'
import { MerkleTree } from './src/types/MerkleTree.js'
import { OutPoint } from './src/types/OutPoint.js'
import { Output } from './src/types/Output.js'
import { PrivateKey } from './src/types/PrivateKey.js'
import { PublicKey } from './src/types/PublicKey.js'
import { Script } from './src/types/Script.js'
import { Transaction } from './src/types/Transaction.js'
import { Network, TransactionType } from './src/constants.js'
import * as utils from './src/utils.js'

export type { TransactionInputToSign } from './src/types/Transaction.js'

export {
  DashCoreSDK,
  BlockHeader,
  Block,
  BlockJSON,
  ExtraPayload,
  Messages,
  BloomFilterWriter,
  Input,
  InstantLock,
  MerkleBlock,
  MerkleTree,
  Network,
  OutPoint,
  Output,
  PrivateKey,
  PublicKey,
  Script,
  Transaction,
  TransactionJSON,
  TransactionType,
  utils
}

export type {
  BloomFilter,
  CoreKeyPair,
  PaymentInfo,
  SubscribeToTransactionsEvent
} from './src/DashCoreSDK.js'

export type {
  InstantAssetLockProofParams,
  ChainAssetLockProofParams,
  InstantAssetLockProofData,
  ChainAssetLockProofData
} from './src/utilsController.js'
