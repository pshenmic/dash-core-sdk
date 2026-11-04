import { describe, expect, test } from '@jest/globals'
import { Input } from '../src/types/Input.js'
import { Output } from '../src/types/Output.js'
import { ProDisTx } from '../src/types/ExtraPayload/ProDisTx.js'
import { Script } from '../src/types/Script.js'
import { Transaction } from '../src/types/Transaction.js'
import { TransactionType } from '../src/constants.js'
import { dissolveSignHash } from '../src/consent.js'

const PRO_TX_HASH = 'ab'.repeat(32)
const SIG = '11'.repeat(65)

function p2pkh (byte: string): Script {
  return Script.fromHex('76a914' + byte.repeat(20) + '88ac')
}

function makeTx (overrides: { actorIndex?: number, outputValue?: bigint, sequence?: number, scriptSig?: Script } = {}): Transaction {
  const payload = new ProDisTx(1, PRO_TX_HASH, overrides.actorIndex ?? 1, [SIG, SIG])

  const inputs = [new Input(PRO_TX_HASH, 2, overrides.scriptSig ?? new Script(), overrides.sequence ?? 0xffffffff)]

  const outputs = [
    new Output(60000000000n, p2pkh('33')),
    new Output(399990000n, p2pkh('44')),
    new Output(overrides.outputValue ?? 396001000000n, p2pkh('55'))
  ]

  return new Transaction(inputs, outputs, 0, 3, TransactionType.TRANSACTION_PROVIDER_DISSOLVE, payload)
}

describe('dissolveSignHash', () => {
  test('returns a 32-byte digest in display order', () => {
    expect(dissolveSignHash(makeTx(), 1)).toMatch(/^[0-9a-f]{64}$/)
  })

  test('is deterministic', () => {
    expect(dissolveSignHash(makeTx(), 1)).toBe(dissolveSignHash(makeTx(), 1))
  })

  test('binds the signature count, which selects the mode', () => {
    expect(dissolveSignHash(makeTx(), 1)).not.toBe(dissolveSignHash(makeTx(), 2))
  })

  test('binds the actor index', () => {
    expect(dissolveSignHash(makeTx({ actorIndex: 2 }), 1)).not.toBe(dissolveSignHash(makeTx(), 1))
  })

  test('binds the outputs', () => {
    expect(dissolveSignHash(makeTx({ outputValue: 396001000001n }), 1)).not.toBe(dissolveSignHash(makeTx(), 1))
  })

  test('binds the input sequences', () => {
    expect(dissolveSignHash(makeTx({ sequence: 0xfffffffe }), 1)).not.toBe(dissolveSignHash(makeTx(), 1))
  })

  test('does not depend on scriptSigs, which must be empty anyway', () => {
    expect(dissolveSignHash(makeTx({ scriptSig: Script.fromHex('51') }), 1)).toBe(dissolveSignHash(makeTx(), 1))
  })

  test('rejects a signature count outside 1..255', () => {
    expect(() => dissolveSignHash(makeTx(), 0)).toThrow(/sigCount/)
    expect(() => dissolveSignHash(makeTx(), 256)).toThrow(/sigCount/)
  })

  test('rejects payloads that are not a ProDisTx', () => {
    const tx = new Transaction([], [], 0, 3, TransactionType.TRANSACTION_PROVIDER_REGISTER)

    expect(() => dissolveSignHash(tx, 1)).toThrow(/ProDisTx/)
  })
})
