import { describe, expect, test } from '@jest/globals'
import { CollateralShare } from '../src/types/CollateralShare.js'
import { ExtNetInfo } from '../src/types/ExtNetInfo.js'
import { Input } from '../src/types/Input.js'
import { OutPoint } from '../src/types/OutPoint.js'
import { Output } from '../src/types/Output.js'
import { ProRegTX } from '../src/types/ExtraPayload/ProRegTX.js'
import { Script } from '../src/types/Script.js'
import { Transaction } from '../src/types/Transaction.js'
import { PROTX_VERSION_EXT_ADDR, SHARED_COLLATERAL_SCRIPT, TransactionType } from '../src/constants.js'
import { consentHash } from '../src/consent.js'

const OWNER_A = 'aa'.repeat(20)
const OWNER_B = 'bb'.repeat(20)
const JOIN_SIG = '00'.repeat(65)

function p2pkh (byte: string): Script {
  return Script.fromHex('76a914' + byte.repeat(20) + '88ac')
}

function share (amount: bigint, owner: string, refundByte: string): CollateralShare {
  return new CollateralShare(amount, p2pkh(refundByte), p2pkh('ee'), owner)
}

function makeTx (overrides: { shareAmount?: bigint, sequence?: number, ownerA?: string, change?: bigint, operatorReward?: number, joinSig?: string, earlyPenalty?: bigint, version?: number } = {}): Transaction {
  const version = overrides.version ?? PROTX_VERSION_EXT_ADDR
  const extended = version >= PROTX_VERSION_EXT_ADDR
    ? {
        netInfo: new ExtNetInfo(),
        payouts: [],
        shares: [
          share(overrides.shareAmount ?? 60000000000n, overrides.ownerA ?? OWNER_A, 'cc'),
          share(40000000000n, OWNER_B, 'dd')
        ],
        joinSigs: [overrides.joinSig ?? JOIN_SIG, JOIN_SIG],
        earlyPeriodBlocks: 420480,
        earlyPenalty: overrides.earlyPenalty ?? 1000000n
      }
    : undefined

  const payload = new ProRegTX(
    version, 0, 0, new OutPoint('00'.repeat(32), 0xffffffff),
    undefined, undefined,
    OWNER_A, 'ab'.repeat(48), '12'.repeat(20), overrides.operatorReward ?? 0,
    p2pkh('11'), '00'.repeat(32),
    undefined, undefined, undefined, '', extended as any
  )

  const inputs = [
    new Input('11'.repeat(32), 0, new Script(), overrides.sequence ?? 0xffffffff),
    new Input('22'.repeat(32), 1, new Script(), 0xffffffff)
  ]

  const outputs = [
    new Output(overrides.change ?? 99950000000n, p2pkh('33')),
    new Output(100000000000n, Script.fromHex(SHARED_COLLATERAL_SCRIPT))
  ]

  return new Transaction(inputs, outputs, 0, 3, TransactionType.TRANSACTION_PROVIDER_REGISTER, payload)
}

describe('consentHash', () => {
  test('returns a 32-byte digest in display order', () => {
    expect(consentHash(makeTx())).toMatch(/^[0-9a-f]{64}$/)
  })

  test('is deterministic', () => {
    expect(consentHash(makeTx())).toBe(consentHash(makeTx()))
  })

  test('binds the share amounts', () => {
    expect(consentHash(makeTx({ shareAmount: 59999999999n }))).not.toBe(consentHash(makeTx()))
  })

  test('binds the share owner keys', () => {
    expect(consentHash(makeTx({ ownerA: 'ff'.repeat(20) }))).not.toBe(consentHash(makeTx()))
  })

  test('binds the input sequences', () => {
    expect(consentHash(makeTx({ sequence: 0xfffffffe }))).not.toBe(consentHash(makeTx()))
  })

  test('binds the outputs', () => {
    expect(consentHash(makeTx({ change: 99940000000n }))).not.toBe(consentHash(makeTx()))
  })

  test('binds the operator reward', () => {
    expect(consentHash(makeTx({ operatorReward: 100 }))).not.toBe(consentHash(makeTx()))
  })

  test('does not depend on the join signatures it authorises', () => {
    expect(consentHash(makeTx({ joinSig: '11'.repeat(65) }))).toBe(consentHash(makeTx()))
  })

  test('does not depend on the funding scriptSigs', () => {
    const tx = makeTx()
    const signed = makeTx()
    signed.inputs[0].scriptSig = Script.fromHex('00'.repeat(10))

    expect(consentHash(signed)).toBe(consentHash(tx))
  })

  test('binds the early penalty', () => {
    expect(consentHash(makeTx({ earlyPenalty: 999999n }))).not.toBe(consentHash(makeTx()))
  })

  test('rejects payloads older than v3', () => {
    expect(() => consentHash(makeTx({ version: 2 }))).toThrow(/version/)
  })
})
