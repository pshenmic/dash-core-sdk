import { describe, expect, test } from '@jest/globals'
import { ProDisTx } from '../src/types/ExtraPayload/ProDisTx.js'
import { ProUpShareTx } from '../src/types/ExtraPayload/ProUpShareTx.js'
import { ProUpSharedRegTx } from '../src/types/ExtraPayload/ProUpSharedRegTx.js'
import { Script } from '../src/types/Script.js'
import { Transaction } from '../src/types/Transaction.js'
import { TransactionType } from '../src/constants.js'

const hash = 'ab'.repeat(32)
const sig = 'cd'.repeat(65)

describe('v24 provider payloads', () => {
  test('ProDisTx round-trips', () => {
    const payload = new ProDisTx(1, hash, 2, [sig, sig])
    const parsed = ProDisTx.fromHex(payload.hex())
    expect(parsed.toJSON()).toEqual(payload.toJSON())
    expect(payload.bytes().byteLength).toBe(37 + 130)
  })

  test('ProUpShareTx round-trips', () => {
    const script = Script.fromBytes(new Uint8Array([0x51]))
    const payload = new ProUpShareTx(1, hash, 3, script, hash, sig)
    const parsed = ProUpShareTx.fromHex(payload.hex())
    expect(parsed.toJSON()).toEqual(payload.toJSON())
    expect(parsed.hex()).toBe(payload.hex())
  })

  test('ProUpSharedRegTx round-trips', () => {
    const payload = new ProUpSharedRegTx(1, hash, 'ef'.repeat(48), '12'.repeat(20), hash, [sig, sig, sig])
    const parsed = ProUpSharedRegTx.fromHex(payload.hex())
    expect(parsed.toJSON()).toEqual(payload.toJSON())
  })

  test('Transaction serializes and parses new types', () => {
    const payload = new ProDisTx(1, hash, 0, [sig])
    const tx = new Transaction([], [], 0, 3, TransactionType.TRANSACTION_PROVIDER_DISSOLVE, payload)
    expect(tx.getExtraPayloadType()).toBe('ProDisTx')
    const parsed = Transaction.fromHex(tx.hex())
    expect(parsed.type).toBe(10)
    expect((parsed.extraPayload as ProDisTx).sigs).toEqual([sig])
  })
})
