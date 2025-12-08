import {TransactionType} from "./constants";

export type TransactionJSON = {
  version: number
  type: TransactionType
  nLockTime: number,
  inputs: string[],
  outputs: string[],
  extraPayload: string | null
}

export type ScriptChunk = {
  opcode: number,
  data?: ArrayBuffer
}