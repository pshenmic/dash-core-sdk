import {Network, TransactionType} from './constants.js'

export interface TransactionJSON {
  version: number
  type: TransactionType
  nLockTime: number
  inputs: InputJSON[]
  outputs: OutputJSON[]
  extraPayload: string | null
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

export interface ScriptChunk {
  opcode: number
  data?: ArrayBuffer
}

export type NetworkLike = Network | keyof typeof Network