import {TransactionType} from "./constants";

export type TransactionJSON = {
  version: number
  type: TransactionType
  nLockTime: number
}

export type ScriptChunk = {
  opcode: number,
  data?: ArrayBuffer
}