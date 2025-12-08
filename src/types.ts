import {TransactionType} from "./constants";

export type TransactionJSON = {
  version: number
  type: TransactionType
  nLockTime: number,
  inputs: InputJSON[],
  outputs: OutputJSON[],
  extraPayload: string | null
}

export type OutPointJSON = {
  txId: string,
  vOut: number
}

export type InstantLockJSON = {
  version: number
  inputs: OutPointJSON[],
  txId: string,
  cycleHash: string,
  signature: string
}

export type BlockHeaderJSON = {
  version: number,
  previousBlockHash: string,
  merkleRoot: string,
  time: number,
  nBits: number,
  nonce: number,
}

export type InputJSON = {
  txId: string,
  vOut: number
  scriptSig: string,
  sequence: number,
}

export type MerkleTreeJSON = {
  transactionCount: number,
  hashes: string[],
  flags: boolean[],
}

export type MerkleBlockJSON = {
  blockHeader: BlockHeaderJSON,
  merkleTree: MerkleTreeJSON,
}

export type OutputJSON = {
  satoshis: string,
  script: string,
}

export type PublicKeyJSON = {
  inner: string,
  compressed: boolean
}

export type ScriptChunk = {
  opcode: number,
  data?: ArrayBuffer
}