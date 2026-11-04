import { PROTX_VERSION_EXT_ADDR } from './constants.js'
import { ExtNetInfo } from './types/ExtNetInfo.js'
import { ProDisTx } from './types/ExtraPayload/ProDisTx.js'
import { ProRegTX } from './types/ExtraPayload/ProRegTX.js'
import { OutPoint } from './types/OutPoint.js'
import { Transaction } from './types/Transaction.js'
import { bytesToHex, doubleSHA256, encodeCompactSize, hexToBytes } from './utils.js'

const CONSENT_PREFIX = 'DashSharedMNReg'
const DISSOLVE_PREFIX = 'DashSharedMNDissolve'

function concat (chunks: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0))

  let offset = 0

  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }

  return out
}

/**
 * Serializes in Bitcoin's little-endian wire format the way Dash Core's CHashWriter does,
 * then returns the double SHA256 in display order.
 */
class HashWriter {
  chunks: Uint8Array[] = []

  bytes (value: Uint8Array): this {
    this.chunks.push(value)

    return this
  }

  u8 (value: number): this {
    return this.bytes(Uint8Array.of(value))
  }

  u16 (value: number): this {
    const bytes = new Uint8Array(2)
    new DataView(bytes.buffer).setUint16(0, value, true)

    return this.bytes(bytes)
  }

  i16 (value: number): this {
    const bytes = new Uint8Array(2)
    new DataView(bytes.buffer).setInt16(0, value, true)

    return this.bytes(bytes)
  }

  u32 (value: number): this {
    const bytes = new Uint8Array(4)
    new DataView(bytes.buffer).setUint32(0, value, true)

    return this.bytes(bytes)
  }

  i64 (value: bigint): this {
    const bytes = new Uint8Array(8)
    new DataView(bytes.buffer).setBigInt64(0, value, true)

    return this.bytes(bytes)
  }

  string (value: string): this {
    const bytes = new TextEncoder().encode(value)

    return this.bytes(encodeCompactSize(bytes.byteLength)).bytes(bytes)
  }

  hash (): string {
    return bytesToHex(doubleSHA256(concat(this.chunks)).toReversed())
  }
}

function prevoutsHash (tx: Transaction): Uint8Array {
  return doubleSHA256(concat(tx.inputs.map(input => new OutPoint(input.txId, input.vOut).bytes())))
}

function outputsHash (tx: Transaction): Uint8Array {
  return doubleSHA256(concat(tx.outputs.map(output => output.bytes())))
}

function lockTimeValue (tx: Transaction): number {
  const lockTime = tx.nLockTime

  return typeof lockTime === 'number' ? lockTime : lockTime.getTime()
}

/**
 * CProRegTx::MakeSharedRegConsentHash: the digest every participant signs with the owner key
 * of their share. It binds the funding inputs, every output, the share table, the penalty terms
 * and the registrar configuration, and deliberately excludes scriptSigs and joinSigs.
 */
export function consentHash (tx: Transaction): string {
  const payload = tx.extraPayload

  if (!(payload instanceof ProRegTX)) {
    throw new Error('consentHash requires a ProRegTX payload')
  }

  if (payload.version < PROTX_VERSION_EXT_ADDR) {
    throw new Error(`consentHash requires ProRegTX version ${PROTX_VERSION_EXT_ADDR} or newer, got ${payload.version}`)
  }

  const shares = payload.shares ?? []
  const joinSigs = payload.joinSigs ?? []

  if (shares.length === 0) {
    throw new Error('consentHash requires at least one share')
  }

  if (joinSigs.length !== shares.length) {
    throw new Error(`consentHash join signature count mismatch: ${joinSigs.length} signatures for ${shares.length} shares`)
  }

  const writer = new HashWriter()

  writer.string(CONSENT_PREFIX)
  writer.u16(payload.version)
  writer.i16(tx.version)
  writer.u16(tx.type)
  writer.u32(lockTimeValue(tx))
  writer.bytes(prevoutsHash(tx))

  for (const input of tx.inputs) {
    writer.u32(input.sequence)
  }

  writer.bytes(outputsHash(tx))
  writer.u16(payload.type)
  writer.u16(payload.mode)
  writer.bytes((payload.netInfo ?? new ExtNetInfo()).bytes())

  if (payload.type === 1 && payload.platformNodeID !== undefined) {
    writer.bytes(hexToBytes(payload.platformNodeID))
  }

  writer.bytes(hexToBytes(payload.keyIdVoting))
  writer.bytes(hexToBytes(payload.pubKeyOperator))
  writer.u16(payload.operatorReward)
  writer.u8(shares.length)

  for (const share of shares) {
    writer.bytes(share.bytes())
  }

  writer.u32(payload.earlyPeriodBlocks ?? 0)
  writer.i64(payload.earlyPenalty ?? 0n)

  return writer.hash()
}

/**
 * CProDisTx::MakeSignHash: the digest authorising a dissolution. It binds the transaction's
 * inputs and outputs directly, plus the actor's share index and the signature count, which
 * selects unilateral (1) or unanimous (n) mode — so a signature set cannot be reinterpreted
 * in the other mode.
 */
export function dissolveSignHash (tx: Transaction, sigCount: number): string {
  const payload = tx.extraPayload

  if (!(payload instanceof ProDisTx)) {
    throw new Error('dissolveSignHash requires a ProDisTx payload')
  }

  if (!Number.isInteger(sigCount) || sigCount < 1 || sigCount > 255) {
    throw new Error(`dissolveSignHash requires sigCount in 1..255, got ${sigCount}`)
  }

  const writer = new HashWriter()

  writer.string(DISSOLVE_PREFIX)
  writer.u16(payload.version)
  writer.i16(tx.version)
  writer.u16(tx.type)
  writer.u32(lockTimeValue(tx))

  for (const input of tx.inputs) {
    writer.bytes(new OutPoint(input.txId, input.vOut).bytes())
  }

  for (const input of tx.inputs) {
    writer.u32(input.sequence)
  }

  for (const output of tx.outputs) {
    writer.bytes(output.bytes())
  }

  writer.bytes(hexToBytes(payload.proTxHash))
  writer.u16(payload.actorIndex)
  writer.u8(sigCount)

  return writer.hash()
}
