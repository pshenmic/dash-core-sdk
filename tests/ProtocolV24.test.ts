import { describe, expect, test } from '@jest/globals'
import { CbTx } from '../src/types/ExtraPayload/CbTx.js'
import { AssetUnlockTx } from '../src/types/ExtraPayload/AssetUnlockTx.js'
import { ProRegTX } from '../src/types/ExtraPayload/ProRegTX.js'
import { ProUpServTx } from '../src/types/ExtraPayload/ProUpServTx.js'
import { ProUpRegTx } from '../src/types/ExtraPayload/ProUpRegTx.js'
import { ExtNetInfo, NetInfoEntryType, NetInfoPurpose } from '../src/types/ExtNetInfo.js'
import { Transaction } from '../src/types/Transaction.js'
import { TransactionType } from '../src/constants.js'
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
