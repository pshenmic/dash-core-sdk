import { describe, expect, jest, test } from '@jest/globals'
import { DashCoreSDK, SubscribeToTransactionsEvent } from '../src/DashCoreSDK.js'
import { Transaction } from '../src/types/Transaction.js'
import { Input } from '../src/types/Input.js'
import { Output } from '../src/types/Output.js'
import { Script } from '../src/types/Script.js'
import { InstantLock } from '../src/types/InstantLock.js'

describe('waitForPayment', () => {
  test('should skip events that cannot be parsed', async () => {
    const sdk = new DashCoreSDK({ network: 'testnet', dapiUrl: 'https://127.0.0.1:1443' })

    const script = Script.fromHex('76a914' + '99'.repeat(20) + '88ac')
    const address = script.getAddress('testnet') as string
    const payment = new Transaction([new Input('cc'.repeat(32), 0, new Script(), 0xffffffff)], [new Output(5000n, script)])
    const instantLock = new InstantLock(1, [], payment.hash(), 'aa'.repeat(32), 'bb'.repeat(96))

    const events: SubscribeToTransactionsEvent[] = [
      { event: 'rawTransaction', data: '00' },
      { event: 'instantSendLockMessage', data: 'ff' },
      { event: 'rawTransaction', data: payment.hex() },
      { event: 'instantSendLockMessage', data: instantLock.hex() }
    ]

    jest.spyOn(sdk, 'subscribeToTransactions').mockImplementation(async function * () {
      yield * events
    })

    await expect(sdk.waitForPayment(address, 1000n)).resolves.toEqual({
      txid: payment.hash(),
      instantLocked: instantLock.hex()
    })
  })
})
