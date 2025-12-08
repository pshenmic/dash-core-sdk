import {TransactionType} from "./constants";

export type TransactionJSON = {
  version: number
  type: TransactionType
  nLockTime: number,
  inputs: string[],
  outputs: string[],
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

export type ScriptChunk = {
  opcode: number,
  data?: ArrayBuffer
}