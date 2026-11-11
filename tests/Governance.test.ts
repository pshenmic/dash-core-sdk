import { describe, expect, test } from '@jest/globals'
import { readFileSync } from 'fs'
import { GovernanceObject } from '../src/types/Governance/GovernanceObject.js'
import { GovernanceVote } from '../src/types/Governance/GovernanceVote.js'
import { OutPoint } from '../src/types/OutPoint.js'
import { PrivateKey } from '../src/types/PrivateKey.js'
import { GovernanceObjectType, Network, VoteOutcome, VoteSignal } from '../src/constants.js'
import { recoverHashSigner, recoverMessageSigner } from '../src/signing.js'
import { bytesToHex, doubleSHA256, hexToBytes } from '../src/utils.js'

interface Fixture {
  objects: Array<{ hash: string, payload: string }>
  votes: Array<{ hash: string, parentHash: string, payload: string }>
}

// Dash Core 24.0.0 testnet govobj/govobjvote messages, hashes are the inv hashes the peer announced
const fixture: Fixture = JSON.parse(readFileSync(new URL('./fixtures/governance.json', import.meta.url), 'utf8'))

const hexOf = (text: string): string => bytesToHex(new TextEncoder().encode(text))

describe('GovernanceObject', () => {
  test.each(fixture.objects)('should parse, round-trip and hash recorded object $hash', ({ hash, payload }) => {
    const object = GovernanceObject.fromHex(payload)

    expect(object.hex()).toBe(payload)
    expect(object.hash()).toBe(hash)
    expect(object.parentHash).toBe('00'.repeat(32))
    expect(object.revision).toBe(1)
    expect(object.type).toBe(GovernanceObjectType.PROPOSAL)
    expect(object.toJSON().hash).toBe(hash)
  })

  test('should read the proposal fields', () => {
    const proposal = GovernanceObject.fromHex(fixture.objects[0].payload).proposal()

    expect(proposal).toEqual({
      end_epoch: 1796402740,
      name: 'Another-demo-govenr',
      payment_address: 'yd83NmVwTmdZ4C7y3gmWxgf7prAj89q8ji',
      payment_amount: 150,
      start_epoch: 1791251780,
      type: 1,
      url: 'https://govenr.vercel.app/proposals/another-demo-govenr'
    })
  })

  test('should unwrap a pre-0.14 proposal', () => {
    const object = GovernanceObject.fromHex(fixture.objects[0].payload)
    object.data = hexOf('[["proposal",{"name":"old","payment_address":"yd83NmVwTmdZ4C7y3gmWxgf7prAj89q8ji","payment_amount":5,"start_epoch":1,"end_epoch":2,"url":"u"}]]')

    expect(object.proposal().name).toBe('old')
    expect(object.proposal().payment_amount).toBe(5)
  })

  test('should refuse non-proposal data', () => {
    const object = GovernanceObject.fromHex(fixture.objects[0].payload)

    for (const data of ['not json', '[["trigger",{}]]', '[]', '42', 'null']) {
      object.data = hexOf(data)
      expect(() => object.proposal()).toThrow()
    }

    object.data = hexOf('{}')
    object.type = GovernanceObjectType.TRIGGER
    expect(() => object.proposal()).toThrow('not a proposal')
  })

  test('should exclude type and collateral hash from the hash', () => {
    const object = GovernanceObject.fromHex(fixture.objects[0].payload)
    object.type = GovernanceObjectType.TRIGGER
    object.collateralHash = '11'.repeat(32)

    expect(object.hash()).toBe(fixture.objects[0].hash)

    object.revision = 2
    expect(object.hash()).not.toBe(fixture.objects[0].hash)
  })

  test('should hash the data as lowercase hex whatever case it is stored in', () => {
    const object = GovernanceObject.fromHex(fixture.objects[0].payload)
    object.data = object.data.toUpperCase()

    expect(object.hash()).toBe(fixture.objects[0].hash)
  })

  test('should refuse a truncated object', () => {
    expect(() => GovernanceObject.fromHex(fixture.objects[0].payload.slice(0, -2))).toThrow()
  })
})

describe('GovernanceVote', () => {
  test.each(fixture.votes)('should parse, round-trip and hash recorded vote $hash', ({ hash, parentHash, payload }) => {
    const vote = GovernanceVote.fromHex(payload)

    expect(vote.hex()).toBe(payload)
    expect(vote.hash()).toBe(hash)
    expect(vote.parentHash).toBe(parentHash)
    expect(vote.signal).toBe(VoteSignal.FUNDING)
    expect(hexToBytes(vote.signature).byteLength).toBe(65)
  })

  test('should vote on a recorded object by its hash', () => {
    expect(fixture.votes.map(vote => vote.parentHash)).toContain(GovernanceObject.fromHex(fixture.objects[0].payload).hash())
  })

  test('should exclude the signature from the hash', () => {
    const vote = GovernanceVote.fromHex(fixture.votes[0].payload)
    vote.signature = ''

    expect(vote.hash()).toBe(fixture.votes[0].hash)
  })

  test('should hash signal before outcome', () => {
    const vote = GovernanceVote.fromHex(fixture.votes[0].payload)
    const swapped = new GovernanceVote(vote.masternodeOutpoint, vote.parentHash, vote.signal, vote.outcome, vote.time)

    // the recorded vote is outcome YES (1), signal FUNDING (1): swapping them keeps the hash
    expect(swapped.hash()).toBe(vote.hash())

    vote.outcome = VoteOutcome.NO
    swapped.signal = VoteSignal.VALID
    expect(swapped.hash()).not.toBe(vote.hash())
  })

  test('should hash the fields in wire order for the testnet signature', () => {
    const vote = GovernanceVote.fromHex(fixture.votes[0].payload)

    expect(vote.signatureHash()).toEqual(doubleSHA256(hexToBytes(fixture.votes[0].payload).slice(0, 84)))
  })

  test('should recover the recorded testnet signer under the hash rule', () => {
    const vote = GovernanceVote.fromHex(fixture.votes[0].payload)

    expect(vote.recoverSigner(Network.Testnet).hex())
      .toBe(recoverHashSigner(vote.signatureHash(), hexToBytes(vote.signature)).hex())
  })

  describe('signing', () => {
    const votingKey = PrivateKey.fromBytes(hexToBytes('33'.repeat(32)), Network.Testnet)
    const outpoint = new OutPoint('a8'.repeat(32), 7)
    const makeVote = (): GovernanceVote => new GovernanceVote(outpoint, fixture.objects[0].hash, VoteOutcome.YES, VoteSignal.FUNDING, 1792950259)

    test('should build the message string', () => {
      expect(makeVote().signString()).toBe(`${'a8'.repeat(32)}-7|${fixture.objects[0].hash}|1|1|1792950259`)
    })

    test('should sign the hash on testnet', () => {
      const vote = makeVote()
      vote.sign(votingKey)

      expect(recoverHashSigner(vote.signatureHash(), hexToBytes(vote.signature)).getAddress(Network.Testnet)).toBe(votingKey.getAddress())
      expect(vote.recoverSigner(Network.Testnet).getAddress(Network.Testnet)).toBe(votingKey.getAddress())
      expect(vote.recoverSigner(Network.Mainnet).getAddress(Network.Testnet)).not.toBe(votingKey.getAddress())
    })

    test('should sign the message on mainnet', () => {
      const vote = makeVote()
      vote.sign(votingKey, Network.Mainnet)

      expect(recoverMessageSigner(vote.signString(), hexToBytes(vote.signature)).getAddress(Network.Testnet)).toBe(votingKey.getAddress())
      expect(vote.recoverSigner('mainnet').getAddress(Network.Testnet)).toBe(votingKey.getAddress())
      expect(vote.recoverSigner(Network.Testnet).getAddress(Network.Testnet)).not.toBe(votingKey.getAddress())
    })

    test('should round-trip a signed vote', () => {
      const vote = makeVote()
      vote.sign(votingKey)

      const parsed = GovernanceVote.fromBytes(vote.bytes())
      expect(parsed.hex()).toBe(vote.hex())
      expect(parsed.hash()).toBe(vote.hash())
      expect(parsed.toJSON()).toEqual(vote.toJSON())
    })
  })
})
