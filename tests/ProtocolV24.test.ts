import { describe, expect, test } from '@jest/globals'
import { CbTx } from '../src/types/ExtraPayload/CbTx.js'
import { AssetUnlockTx } from '../src/types/ExtraPayload/AssetUnlockTx.js'
import { ProRegTX } from '../src/types/ExtraPayload/ProRegTX.js'
import { ProUpServTx } from '../src/types/ExtraPayload/ProUpServTx.js'
import { ProUpRegTx } from '../src/types/ExtraPayload/ProUpRegTx.js'
import { ExtNetInfo, NetInfoEntryType, NetInfoPurpose } from '../src/types/ExtNetInfo.js'
import { Transaction } from '../src/types/Transaction.js'
import { Input } from '../src/types/Input.js'
import { Output } from '../src/types/Output.js'
import { Script } from '../src/types/Script.js'
import { SHARED_COLLATERAL_SCRIPT, TransactionType } from '../src/constants.js'
import { RawExtraPayload } from '../src/types/ExtraPayload/RawExtraPayload.js'
import { bytesToHex, doubleSHA256 } from '../src/utils.js'

const p2pkh = '76a914' + '99'.repeat(20) + '88ac'

describe('CbTx v4', () => {
  const hex = '0400' + '10000000' + '11'.repeat(32) + '22'.repeat(32) + '00' + '33'.repeat(96) + '0100000000000000' + '44'.repeat(32)

  test('should parse merkleRootAssetUnlocks', () => {
    const cbTx = CbTx.fromHex(hex)

    expect(cbTx.version).toBe(4)
    expect(cbTx.creditPoolBalance).toBe(1n)
    expect(cbTx.merkleRootAssetUnlocks).toBe('44'.repeat(32))
  })

  test('should round-trip', () => {
    expect(CbTx.fromHex(hex).hex()).toBe(hex)
  })

  test('should not emit merkleRootAssetUnlocks before v4', () => {
    const v3 = '0300' + hex.slice(4, hex.length - 64)

    expect(CbTx.fromHex(v3).hex()).toBe(v3)
    expect(CbTx.fromHex(v3).merkleRootAssetUnlocks).toBeUndefined()
  })
})

describe('Asset unlock txid', () => {
  const makeTx = (payloadVersion: number): Transaction => new Transaction([], [], 0, 3, TransactionType.TRANSACTION_ASSET_UNLOCK,
    new AssetUnlockTx(payloadVersion, 5n, 1000, 100, 'aa'.repeat(32), 'bb'.repeat(96)))

  test('should exclude quorum info from the v2 txid', () => {
    const tx = makeTx(2)
    const bytes = tx.bytes()
    bytes.fill(0, bytes.byteLength - (4 + 32 + 96))

    expect(tx.hash()).toBe(bytesToHex(doubleSHA256(bytes).toReversed()))
    expect(tx.instanceHash()).toBe(bytesToHex(doubleSHA256(tx.bytes()).toReversed()))
    expect(tx.hash()).not.toBe(tx.instanceHash())
  })

  test('should share one txid across re-signed v2 instances', () => {
    const resigned = new Transaction([], [], 0, 3, TransactionType.TRANSACTION_ASSET_UNLOCK,
      new AssetUnlockTx(2, 5n, 1000, 148, 'cc'.repeat(32), 'dd'.repeat(96)))

    expect(resigned.hash()).toBe(makeTx(2).hash())
    expect(resigned.instanceHash()).not.toBe(makeTx(2).instanceHash())
  })

  test('should hash v1 over the full serialization', () => {
    const tx = makeTx(1)

    expect(tx.hash()).toBe(tx.instanceHash())
  })
})

describe('ExtNetInfo', () => {
  test('should parse services and domains', () => {
    const hex = '01' + '02' +
      '00' + '01' + '01' + '01' + '04' + '01020304' + '4e1f' +
      '02' + '02' +
      '02' + '0b' + bytesToHex(new TextEncoder().encode('example.com')) + '01bb' +
      '01' + '02' + '10' + '20010db8000000000000000000000001' + '01bb'

    const netInfo = ExtNetInfo.fromHex(hex)

    expect(netInfo.getPrimary(NetInfoPurpose.CORE_P2P)).toBe('1.2.3.4:19999')
    expect(netInfo.getPrimary(NetInfoPurpose.PLATFORM_HTTPS)).toBe('example.com:443')
    expect(netInfo.entries.get(NetInfoPurpose.PLATFORM_HTTPS)?.[1]).toEqual({
      type: NetInfoEntryType.Service,
      network: 2,
      address: '2001:0db8:0000:0000:0000:0000:0000:0001',
      port: 443
    })
    expect(netInfo.hex()).toBe(hex)
  })

  test('should read only the version of an unknown version', () => {
    expect(ExtNetInfo.fromHex('02ffff').hex()).toBe('02')
  })
})

describe('ProTx v3', () => {
  const coreNetInfo = '01' + '01' + '00' + '01' + '01' + '01' + '04' + '01020304' + '270f'

  test('ProUpServTx v3 evo should parse and round-trip', () => {
    const netInfo = '01' + '02' +
      '00' + '01' + '01' + '01' + '04' + '01020304' + '4e1f' +
      '02' + '01' + '01' + '01' + '04' + '01020304' + '05a3'
    const hex = '0300' + '0100' + 'aa'.repeat(32) + netInfo + '00' + 'bb'.repeat(32) + 'cc'.repeat(20) + 'dd'.repeat(96)

    const payload = ProUpServTx.fromHex(hex)

    expect(payload.version).toBe(3)
    expect(payload.type).toBe(1)
    expect(payload.ipAddress).toBe('1.2.3.4')
    expect(payload.port).toBe(19999)
    expect(payload.netInfo?.getPrimary(NetInfoPurpose.PLATFORM_HTTPS)).toBe('1.2.3.4:1443')
    expect(payload.platformP2PPort).toBeUndefined()
    expect(payload.platformHTTPPort).toBeUndefined()
    expect(payload.payloadSig).toBe('dd'.repeat(96))
    expect(payload.hex()).toBe(hex)
  })

  test('ProRegTx v3 shared registration should parse and round-trip', () => {
    const share = (owner: string): string => '00743ba40b000000' + '0151' + '00' + owner.repeat(20)
    const hex = '0300' + '0000' + '0000' + 'ee'.repeat(32) + '00000000' + coreNetInfo +
      '11'.repeat(20) + '22'.repeat(48) + '33'.repeat(20) + '0000' +
      '01' + '19' + p2pkh + '1027' +
      '02' + share('44') + share('55') + 'f1'.repeat(65) + 'f2'.repeat(65) +
      '00000100' + '0010a5d4e8000000' +
      '66'.repeat(32) + '41' + '77'.repeat(65)

    const payload = ProRegTX.fromHex(hex)

    expect(payload.ipAddress).toBe('1.2.3.4')
    expect(payload.port).toBe(9999)
    expect(payload.payouts?.map(payout => payout.reward)).toEqual([10000])
    expect(payload.scriptPayout.hex()).toBe(p2pkh)
    expect(payload.shares?.map(share => share.amount)).toEqual([50000000000n, 50000000000n])
    expect(payload.shares?.[1].keyIdOwner).toBe('55'.repeat(20))
    expect(payload.joinSigs).toEqual(['f1'.repeat(65), 'f2'.repeat(65)])
    expect(payload.earlyPeriodBlocks).toBe(65536)
    expect(payload.earlyPenalty).toBe(1000000000000n)
    expect(payload.inputsHash).toBe('66'.repeat(32))
    expect(payload.payloadSig).toBe('77'.repeat(65))
    expect(payload.hex()).toBe(hex)
  })

  test('ProRegTx v3 should parse inside a transaction', () => {
    const hex = '0300' + '0100' + '0000' + 'ee'.repeat(32) + '00000000' + coreNetInfo +
      '11'.repeat(20) + '22'.repeat(48) + '33'.repeat(20) + '0000' +
      '01' + '19' + p2pkh + '1027' + '00' + '00000000' + '0000000000000000' +
      '66'.repeat(32) + 'cc'.repeat(20) + '00'
    const tx = new Transaction([], [], 0, 3, TransactionType.TRANSACTION_PROVIDER_REGISTER, ProRegTX.fromHex(hex))

    const parsed = Transaction.fromHex(tx.hex())

    expect((parsed.extraPayload as ProRegTX).platformNodeID).toBe('cc'.repeat(20))
    expect((parsed.extraPayload as ProRegTX).hex()).toBe(hex)
  })

  test('ProUpRegTx v3 should parse payouts and round-trip', () => {
    const hex = '0300' + 'aa'.repeat(32) + '0000' + '22'.repeat(48) + '33'.repeat(20) +
      '02' + '19' + p2pkh + '8813' + '01' + '51' + '8813' +
      '66'.repeat(32) + '41' + '77'.repeat(65)

    const payload = ProUpRegTx.fromHex(hex)

    expect(payload.payouts?.map(payout => payout.reward)).toEqual([5000, 5000])
    expect(payload.scriptPayout.hex()).toBe(p2pkh)
    expect(payload.inputsHash).toBe('66'.repeat(32))
    expect(payload.hex()).toBe(hex)
  })

  test('should reject unknown versions', () => {
    expect(() => ProRegTX.fromHex('0400')).toThrow('Unsupported version')
    expect(() => ProUpServTx.fromHex('0400')).toThrow('Unsupported version')
    expect(() => ProUpRegTx.fromHex('0400')).toThrow('Unsupported version')
  })
})

describe('Asset unlock InstantSend lock inputs', () => {
  const makeUnlock = (version: number, index: bigint, requestedHeight = 100): Transaction => new Transaction([], [], 0, 3, TransactionType.TRANSACTION_ASSET_UNLOCK,
    new AssetUnlockTx(version, index, 1000, requestedHeight, 'aa'.repeat(32), 'bb'.repeat(96)))

  test('should compute the DIP-27 request id', () => {
    expect(new AssetUnlockTx(2, 0n, 0, 0, 'aa'.repeat(32), 'bb'.repeat(96)).getRequestId())
      .toBe('922a8fc39b6e265ca761eaaf863387a5e2019f4795a42260805f5562699fd9fa')
    expect(new AssetUnlockTx(2, 5n, 0, 0, 'aa'.repeat(32), 'bb'.repeat(96)).getRequestId())
      .toBe('872092bf84f88754863fe5dd05b7d9d5228d04fcadc58b8682f29a556f9d8bba')
    expect(new AssetUnlockTx(1, 1234567890123n, 0, 0, 'aa'.repeat(32), 'bb'.repeat(96)).getRequestId())
      .toBe('c7ac65eb619d9136ae4dd462b2424676ec75e13fe3566e070352c0dd14658600')
  })

  test('should pin one synthetic outpoint per withdrawal index', () => {
    const inputs = makeUnlock(2, 5n).getLockInputs()

    expect(inputs.map(input => input.toJSON())).toEqual([{ txId: '872092bf84f88754863fe5dd05b7d9d5228d04fcadc58b8682f29a556f9d8bba', vOut: 0 }])
    expect(makeUnlock(2, 5n, 148).getLockInputs()).toEqual(inputs)
    expect(makeUnlock(1, 5n).getLockInputs()).toEqual(inputs)
    expect(makeUnlock(2, 6n).getLockInputs()).not.toEqual(inputs)
  })

  test('should pin the spent outpoints of other transactions', () => {
    const tx = new Transaction([new Input('cc'.repeat(32), 1, new Script(), 0xffffffff)], [new Output(1000n, new Script())])

    expect(tx.getLockInputs().map(input => input.toJSON())).toEqual([{ txId: 'cc'.repeat(32), vOut: 1 }])
  })

  test('should report instanceHash only for version 2 unlocks', () => {
    const v2 = makeUnlock(2, 5n)

    expect(v2.toJSON().instanceHash).toBe(v2.instanceHash())
    expect(makeUnlock(1, 5n).toJSON().instanceHash).toBeUndefined()
  })
})

describe('Shared collateral script', () => {
  test('should match the template exactly', () => {
    expect(Script.sharedCollateral().hex()).toBe(SHARED_COLLATERAL_SCRIPT)
    expect(Script.sharedCollateral().ASMString()).toBe('OP_PUSHBYTES_4 44534843 OP_DROP OP_TRUE')
    expect(Script.fromHex('04445348437551').isSharedCollateral()).toBe(true)
    expect(Script.fromHex('0444534843755151').isSharedCollateral()).toBe(false)
    expect(Script.fromHex('76a914' + '99'.repeat(20) + '88ac').isSharedCollateral()).toBe(false)
  })
})

describe('Undecodable extra payloads', () => {
  const withPayload = (type: number, payloadHex: string): string =>
    new Transaction([new Input('cc'.repeat(32), 0, new Script(), 0xffffffff)], [new Output(1000n, new Script())], 0, 3, type, RawExtraPayload.fromHex(payloadHex)).hex()

  test('should keep an unknown transaction type as raw bytes', () => {
    const hex = withPayload(13, '0100deadbeef')

    const tx = Transaction.fromHex(hex)

    expect(tx.extraPayload).toBeInstanceOf(RawExtraPayload)
    expect(tx.getExtraPayloadType()).toBeUndefined()
    expect(tx.toJSON().extraPayload).toEqual({ raw: '0100deadbeef' })
    expect(tx.hex()).toBe(hex)
  })

  test('should keep a payload its parser rejects as raw bytes', () => {
    const hex = withPayload(TransactionType.TRANSACTION_PROVIDER_REGISTER, '0400' + '00'.repeat(10))

    const tx = Transaction.fromHex(hex)

    expect(tx.extraPayload).toBeInstanceOf(RawExtraPayload)
    expect(tx.getExtraPayloadType()).toBeUndefined()
    expect(tx.hex()).toBe(hex)
  })

  test('should apply the stable txid to a raw asset unlock payload', () => {
    const payload = new AssetUnlockTx(2, 5n, 1000, 100, 'aa'.repeat(32), 'bb'.repeat(96))
    const decoded = new Transaction([], [], 0, 3, TransactionType.TRANSACTION_ASSET_UNLOCK, payload)
    const raw = new Transaction([], [], 0, 3, TransactionType.TRANSACTION_ASSET_UNLOCK, RawExtraPayload.fromBytes(payload.bytes()))

    expect(raw.hash()).toBe(decoded.hash())
    expect(raw.getLockInputs()).toEqual(decoded.getLockInputs())
  })
})
