import { jest } from '@jest/globals'
import { GetBlockchainStatusResponse_Status } from '../proto/generated/core.js'

const TESTNET_SEED = 'https://158.160.14.115:1443'

const getEvonodeList = jest.fn<(network: 'testnet' | 'mainnet') => Promise<string[]>>()
const getBlockchainStatus = jest.fn<() => Promise<{ response: { status: number } }>>()

jest.unstable_mockModule('../src/getEvonodeList.js', () => ({
  default: getEvonodeList
}))

jest.unstable_mockModule('../proto/generated/core.client.js', () => ({
  CoreClient: class {
    getBlockchainStatus = getBlockchainStatus
  }
}))

const { default: GRPCConnectionPool } = await import('../src/grpcConnectionPool.js')

describe('GRPCConnectionPool', () => {
  let consoleError: jest.SpiedFunction<typeof console.error>

  beforeEach(() => {
    getEvonodeList.mockReset()
    getBlockchainStatus.mockReset()
    getBlockchainStatus.mockResolvedValue({ response: { status: GetBlockchainStatusResponse_Status.READY } })
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleError.mockRestore()
  })

  it('should recover from a failed evonode lookup on the next getClient', async () => {
    getEvonodeList.mockRejectedValueOnce(new Error('Platform Explorer is down'))

    const pool = new GRPCConnectionPool('testnet', { poolLimit: 5 })
    await pool.ready()

    expect(pool.dapiUrls).toEqual([TESTNET_SEED])

    getEvonodeList.mockResolvedValueOnce(['https://10.0.0.1:1443', 'https://10.0.0.2:1443'])

    pool.getClient()
    await pool._refresh

    expect(pool.dapiUrls.length).toBeGreaterThan(1)
    expect(pool.dapiUrls).toEqual([TESTNET_SEED, 'https://10.0.0.1:1443', 'https://10.0.0.2:1443'])
  })

  it('should not overwrite an explicitly configured dapiUrl', async () => {
    // Pin the seed URL itself, so only the pinned flag can hold the refresh back
    const pool = new GRPCConnectionPool('testnet', { poolLimit: 5, dapiUrl: TESTNET_SEED })
    await pool.ready()

    expect(pool.dapiUrls).toEqual([TESTNET_SEED])

    pool.getClient()
    await pool._refresh

    expect(getEvonodeList).not.toHaveBeenCalled()
    expect(pool.dapiUrls).toEqual([TESTNET_SEED])
  })

  it('should not overwrite an explicitly configured dapiUrl array', async () => {
    const dapiUrls = ['https://10.0.0.7:1443', 'https://10.0.0.8:1443']

    const pool = new GRPCConnectionPool('testnet', { poolLimit: 5, dapiUrl: dapiUrls })
    await pool.ready()

    pool.getClient()
    await pool._refresh

    expect(getEvonodeList).not.toHaveBeenCalled()
    expect(pool.dapiUrls).toEqual(dapiUrls)
  })

  it('should issue a single lookup for a burst of getClient calls', async () => {
    getEvonodeList.mockRejectedValueOnce(new Error('Platform Explorer is down'))

    const pool = new GRPCConnectionPool('testnet', { poolLimit: 5 })
    await pool.ready()

    getEvonodeList.mockReset()
    // Never settles, so every call in the burst sees a refresh already in flight
    getEvonodeList.mockReturnValue(new Promise(() => {}))

    for (let i = 0; i < 30; i++) {
      pool.getClient()
    }

    expect(getEvonodeList).toHaveBeenCalledTimes(1)
  })

  it('should not refresh a pool that already holds evonodes', async () => {
    getEvonodeList.mockResolvedValueOnce(['https://10.0.0.1:1443'])

    const pool = new GRPCConnectionPool('testnet', { poolLimit: 5 })
    await pool.ready()

    expect(pool.dapiUrls).toEqual([TESTNET_SEED, 'https://10.0.0.1:1443'])

    pool.getClient()

    expect(getEvonodeList).toHaveBeenCalledTimes(1)
  })

  it('should keep unhealthy evonodes out of the pool', async () => {
    getEvonodeList.mockResolvedValueOnce(['https://10.0.0.1:1443', 'https://10.0.0.2:1443'])
    getBlockchainStatus
      .mockResolvedValueOnce({ response: { status: GetBlockchainStatusResponse_Status.SYNCING } })
      .mockResolvedValueOnce({ response: { status: GetBlockchainStatusResponse_Status.READY } })

    const pool = new GRPCConnectionPool('testnet', { poolLimit: 5 })
    await pool.ready()

    expect(pool.dapiUrls).toEqual([TESTNET_SEED, 'https://10.0.0.2:1443'])
  })
})
