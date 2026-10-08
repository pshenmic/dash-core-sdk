import { jest } from '@jest/globals'
import { GetBlockchainStatusResponse_Status } from '../proto/generated/core.js'

const TESTNET_SEEDS = ['https://158.160.14.115:1443', 'https://68.67.122.26:1443']
const [TESTNET_SEED, TESTNET_SEED_B] = TESTNET_SEEDS

const getEvonodeList = jest.fn<(dapiUrls: string[]) => Promise<string[]>>()
const getBlockchainStatus = jest.fn<() => Promise<{ response: { status: number } }>>()

jest.unstable_mockModule('../src/getEvonodeList.js', () => ({
  default: getEvonodeList
}))

jest.unstable_mockModule('../src/createCoreClient.js', () => ({
  default: () => ({ getBlockchainStatus })
}))

const { default: GRPCConnectionPool } = await import('../src/grpcConnectionPool.js')
const { DashCoreSDK } = await import('../src/DashCoreSDK.js')

/**
 * Answer the evonode lookup per seed node, a seed node missing from the map is down
 */
const lookupBySeed = (answers: Record<string, string[]>) => async ([seed]: string[]): Promise<string[]> => {
  if (answers[seed] == null) {
    throw new Error(`${seed} is down`)
  }

  return answers[seed]
}

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
    getEvonodeList.mockImplementation(lookupBySeed({}))

    const pool = new GRPCConnectionPool('testnet', { poolLimit: 5 })
    await pool.ready()

    getEvonodeList.mockImplementation(lookupBySeed({ [TESTNET_SEED]: ['https://10.0.0.1:1443', 'https://10.0.0.2:1443'], [TESTNET_SEED_B]: [] }))

    pool.getClient()
    await pool._refresh

    expect(pool.dapiUrls).toEqual(expect.arrayContaining(['https://10.0.0.1:1443', 'https://10.0.0.2:1443']))
  })

  it('should drop a dead seed node', async () => {
    getEvonodeList.mockImplementation(lookupBySeed({ [TESTNET_SEED]: ['https://10.0.0.1:1443'] }))

    const pool = new GRPCConnectionPool('testnet', { poolLimit: 5 })
    await pool.ready()

    expect(pool.dapiUrls).toEqual([TESTNET_SEED, 'https://10.0.0.1:1443'])
  })

  it('should discover through the next seed node when the first one is dead', async () => {
    getEvonodeList.mockImplementation(lookupBySeed({ [TESTNET_SEED_B]: ['https://10.0.0.1:1443'] }))

    const pool = new GRPCConnectionPool('testnet', { poolLimit: 5 })
    await pool.ready()

    expect(pool.dapiUrls).toEqual([TESTNET_SEED_B, 'https://10.0.0.1:1443'])
  })

  it('should resolve sdk waitForInit once dead seed nodes are dropped', async () => {
    getEvonodeList.mockImplementation(lookupBySeed({ [TESTNET_SEED]: ['https://10.0.0.1:1443'] }))

    const sdk = new DashCoreSDK({ network: 'testnet' })
    await sdk.waitForInit()

    expect(sdk.grpcConnectionPool.dapiUrls).toEqual([TESTNET_SEED, 'https://10.0.0.1:1443'])
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
    getEvonodeList.mockImplementation(lookupBySeed({}))

    const pool = new GRPCConnectionPool('testnet', { poolLimit: 5 })
    await pool.ready()

    getEvonodeList.mockReset()
    // Never settles, so every call in the burst sees a refresh already in flight
    getEvonodeList.mockReturnValue(new Promise(() => {}))

    for (let i = 0; i < 30; i++) {
      pool.getClient()
    }

    expect(getEvonodeList).toHaveBeenCalledTimes(TESTNET_SEEDS.length)
  })

  it('should not refresh a pool that already holds evonodes', async () => {
    getEvonodeList.mockImplementation(lookupBySeed({ [TESTNET_SEED]: ['https://10.0.0.1:1443'], [TESTNET_SEED_B]: [] }))

    const pool = new GRPCConnectionPool('testnet', { poolLimit: 5 })
    await pool.ready()

    expect(pool.dapiUrls).toEqual([...TESTNET_SEEDS, 'https://10.0.0.1:1443'])

    pool.getClient()

    expect(getEvonodeList).toHaveBeenCalledTimes(TESTNET_SEEDS.length)
  })

  it('should query the masternode list through every seed node', async () => {
    getEvonodeList.mockImplementation(lookupBySeed({ [TESTNET_SEED]: [], [TESTNET_SEED_B]: [] }))

    const pool = new GRPCConnectionPool('testnet', { poolLimit: 5 })
    await pool.ready()

    expect(getEvonodeList.mock.calls).toEqual(TESTNET_SEEDS.map((seed) => [[seed]]))
  })

  describe('healthcheck status', () => {
    const rejected = [
      ['NOT_STARTED', GetBlockchainStatusResponse_Status.NOT_STARTED],
      ['SYNCING', GetBlockchainStatusResponse_Status.SYNCING],
      ['ERROR', GetBlockchainStatusResponse_Status.ERROR]
    ] as const

    it('should admit a node reporting READY', async () => {
      getEvonodeList.mockImplementation(lookupBySeed({ [TESTNET_SEED]: ['https://10.0.0.1:1443'], [TESTNET_SEED_B]: [] }))
      getBlockchainStatus.mockResolvedValue({ response: { status: GetBlockchainStatusResponse_Status.READY } })

      const pool = new GRPCConnectionPool('testnet', { poolLimit: 5 })
      await pool.ready()

      expect(pool.dapiUrls).toEqual([...TESTNET_SEEDS, 'https://10.0.0.1:1443'])
    })

    it.each(rejected)('should keep out a node reporting %s', async (_name, status) => {
      getEvonodeList.mockImplementation(lookupBySeed({ [TESTNET_SEED]: ['https://10.0.0.1:1443'], [TESTNET_SEED_B]: [] }))
      getBlockchainStatus.mockResolvedValue({ response: { status } })

      const pool = new GRPCConnectionPool('testnet', { poolLimit: 5 })
      await pool.ready()

      expect(pool.dapiUrls).toEqual(TESTNET_SEEDS)
    })

    it('should keep out a node whose healthcheck throws', async () => {
      getEvonodeList.mockImplementation(lookupBySeed({ [TESTNET_SEED]: ['https://10.0.0.1:1443'], [TESTNET_SEED_B]: [] }))
      getBlockchainStatus.mockRejectedValue(new Error('connection refused'))

      const pool = new GRPCConnectionPool('testnet', { poolLimit: 5 })
      await pool.ready()

      expect(pool.dapiUrls).toEqual(TESTNET_SEEDS)
    })

    it('should stop healthchecking once the pool limit is reached', async () => {
      getEvonodeList.mockImplementation(lookupBySeed({ [TESTNET_SEED]: ['https://10.0.0.1:1443', 'https://10.0.0.2:1443', 'https://10.0.0.3:1443'], [TESTNET_SEED_B]: [] }))
      getBlockchainStatus.mockResolvedValue({ response: { status: GetBlockchainStatusResponse_Status.READY } })

      const pool = new GRPCConnectionPool('testnet', { poolLimit: 3 })
      await pool.ready()

      expect(pool.dapiUrls).toEqual([...TESTNET_SEEDS, 'https://10.0.0.1:1443'])
      expect(getBlockchainStatus).toHaveBeenCalledTimes(1)
    })
  })
})
