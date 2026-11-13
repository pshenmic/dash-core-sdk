import { jest } from '@jest/globals'
import { GetBlockchainStatusResponse_Status } from '../proto/generated/core.js'

interface MockClient {
  url: string
  abortController?: AbortController
  fetch: typeof globalThis.fetch
  getBlockchainStatus: () => Promise<{ response: { status: number } }>
}

const getEvonodeList = jest.fn<(dapiUrls: string[], attempts?: number, abortController?: AbortController) => Promise<string[]>>()
const createCoreClient = jest.fn<(url: string, abortController?: AbortController, fetch?: typeof globalThis.fetch) => MockClient>()

jest.unstable_mockModule('../src/getEvonodeList.js', () => ({
  default: getEvonodeList
}))

jest.unstable_mockModule('../src/createCoreClient.js', () => ({
  default: createCoreClient
}))

const { default: GRPCConnectionPool } = await import('../src/grpcConnectionPool.js')
const { DashCoreSDK } = await import('../src/DashCoreSDK.js')

const READY = GetBlockchainStatusResponse_Status.READY
const SYNCING = GetBlockchainStatusResponse_Status.SYNCING

const TESTNET_SEEDS = [
  'https://153.80.206.232:1443',
  'https://34.209.12.72:1443',
  'https://68.67.122.1:1443',
  'https://68.67.122.2:1443',
  'https://68.67.122.3:1443',
  'https://68.67.122.4:1443',
  'https://68.67.122.5:1443',
  'https://68.67.122.6:1443',
  'https://68.67.122.7:1443',
  'https://68.67.122.8:1443',
  'https://68.67.122.9:1443',
  'https://68.67.122.10:1443',
  'https://68.67.122.11:1443',
  'https://68.67.122.12:1443',
  'https://68.67.122.13:1443',
  'https://68.67.122.14:1443',
  'https://68.67.122.15:1443'
]

const [SEED_A, SEED_B] = TESTNET_SEEDS

const NODE_A = 'https://10.0.0.1:1443'
const NODE_B = 'https://10.0.0.2:1443'
const NODE_C = 'https://10.0.0.3:1443'

const METHOD_PATH = '/org.dash.platform.dapi.v0.Core/getBlockchainStatus'
const BROADCAST_PATH = '/org.dash.platform.dapi.v0.Core/broadcastTransaction'

// 'ready' by default, 'syncing' answers a non-READY status, 'down' throws
const nodeHealth = new Map<string, 'ready' | 'syncing' | 'down'>()

const connectError = (code = 'ECONNREFUSED'): TypeError =>
  Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error(code), { code }) })

const abortError = (): Error => Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })

const OK_RESPONSE = { ok: true } as unknown as Response

const waitFor = async (condition: () => boolean): Promise<void> => {
  for (let i = 0; i < 100; i++) {
    if (condition()) {
      return
    }

    await new Promise(resolve => setImmediate(resolve))
  }

  throw new Error('Condition was not met')
}

const checkedUrls = (): string[] => createCoreClient.mock.calls.map(([url]) => url)

describe('GRPCConnectionPool', () => {
  let fetchSpy: jest.SpiedFunction<typeof globalThis.fetch>

  beforeEach(() => {
    // identity shuffle, so node order in assertions is deterministic
    jest.spyOn(Math, 'random').mockReturnValue(0.9999)
    fetchSpy = jest.spyOn(globalThis, 'fetch')

    nodeHealth.clear()

    getEvonodeList.mockReset()
    getEvonodeList.mockResolvedValue([])

    createCoreClient.mockReset()
    createCoreClient.mockImplementation((url, abortController, fetch) => ({
      url,
      abortController,
      fetch: fetch ?? globalThis.fetch,
      getBlockchainStatus: async () => {
        const health = nodeHealth.get(url) ?? 'ready'

        if (health === 'down') {
          throw new Error(`${url} is down`)
        }

        return { response: { status: health === 'ready' ? READY : SYNCING } }
      }
    }))
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('initialization', () => {
    it('should use a pinned dapiUrl without discovery or healthchecks', async () => {
      const pool = new GRPCConnectionPool('testnet', { dapiUrl: `${NODE_A}/` })
      await pool.ready()

      expect(pool.dapiUrls).toEqual([NODE_A])
      expect(getEvonodeList).not.toHaveBeenCalled()
      expect(createCoreClient).not.toHaveBeenCalled()
    })

    it('should trim and dedupe a pinned dapiUrl array', async () => {
      const pool = new GRPCConnectionPool('testnet', { dapiUrl: [`${NODE_A}/`, NODE_A, NODE_B] })
      await pool.ready()

      expect(pool.dapiUrls).toEqual([NODE_A, NODE_B])
    })

    it('should reject an empty dapiUrl list', async () => {
      const pool = new GRPCConnectionPool('testnet', { dapiUrl: [] })

      await expect(pool.ready()).rejects.toThrow('DAPI URL list is empty')
    })

    it('should reject an unrecognized dapiUrl', async () => {
      const pool = new GRPCConnectionPool('testnet', { dapiUrl: 42 as unknown as string })

      await expect(pool.ready()).rejects.toThrow('Unrecognized DAPI URL')
    })

    it.each([-1, 1.5])('should reject retries = %s', (retries) => {
      expect(() => new GRPCConnectionPool('testnet', { retries })).toThrow('GRPC retries must be a non-negative integer')
    })

    it('should bootstrap from healthy seeds only', async () => {
      for (const seed of TESTNET_SEEDS) {
        nodeHealth.set(seed, 'down')
      }
      nodeHealth.set(SEED_A, 'ready')

      const pool = new GRPCConnectionPool('testnet')
      await pool.ready()

      expect(pool.dapiUrls).toEqual([SEED_A])
    })

    it('should resolve bootstrap at the first healthy seeds and abort the rest', async () => {
      const controllers = new Map<string, AbortController>()

      // the first two seeds answer immediately, the rest hang until they are aborted
      createCoreClient.mockImplementation((url, abortController, fetch) => ({
        url,
        abortController,
        fetch: fetch ?? globalThis.fetch,
        getBlockchainStatus: async () => {
          if (abortController != null) {
            controllers.set(url, abortController)
          }

          if (url === SEED_A || url === SEED_B) {
            return { response: { status: READY } }
          }

          return await new Promise((_resolve, reject) => {
            abortController?.signal.addEventListener('abort', () => reject(abortError()))
          })
        }
      }))

      const pool = new GRPCConnectionPool('testnet')
      await pool.ready()

      expect(pool.dapiUrls).toEqual([SEED_A, SEED_B])

      for (const [url, controller] of controllers) {
        if (url !== SEED_A && url !== SEED_B) {
          expect(controller.signal.aborted).toBe(true)
        }
      }
    })

    it('should race the masternode list query over all seeds', async () => {
      const pool = new GRPCConnectionPool('testnet')
      await pool.ready()

      expect(getEvonodeList).toHaveBeenCalledTimes(TESTNET_SEEDS.length)

      for (const seed of TESTNET_SEEDS) {
        expect(getEvonodeList).toHaveBeenCalledWith([seed], 1, expect.any(AbortController))
      }
    })

    it('should not wait for slow seeds and abort them once one wins the race', async () => {
      const controllers = new Map<string, AbortController>()
      let releaseWinner: (urls: string[]) => void = () => {}
      const winner = new Promise<string[]>(resolve => { releaseWinner = resolve })

      getEvonodeList.mockImplementation(async (urls, _attempts, abortController) => {
        if (abortController != null) {
          controllers.set(urls[0], abortController)
        }

        // only the first seed answers, the rest hang until they are aborted
        return urls[0] === SEED_A
          ? await winner
          : await new Promise<string[]>((_resolve, reject) => {
            abortController?.signal.addEventListener('abort', () => reject(new Error('aborted')))
          })
      })

      const pool = new GRPCConnectionPool('testnet')

      await waitFor(() => controllers.size === TESTNET_SEEDS.length)

      releaseWinner([NODE_A])
      await pool.ready()

      // every seed is aborted once the race is over, including the winner
      for (const controller of controllers.values()) {
        expect(controller.signal.aborted).toBe(true)
      }
    })

    it('should reject when no seed is available and retry on the next call', async () => {
      for (const seed of TESTNET_SEEDS) {
        nodeHealth.set(seed, 'down')
      }

      const pool = new GRPCConnectionPool('testnet')

      await expect(pool.ready()).rejects.toThrow('None of the testnet seed nodes are available (nodes must be synced)')

      nodeHealth.clear()
      await pool.ready()

      expect(pool.dapiUrls).toEqual(TESTNET_SEEDS)
    })

    it('should reject when discovery fails and retry on the next call', async () => {
      getEvonodeList.mockRejectedValue(new Error('discovery failed'))

      const pool = new GRPCConnectionPool('testnet')

      await expect(pool.ready()).rejects.toThrow('None of the testnet seed nodes are available')

      getEvonodeList.mockResolvedValue([])
      await pool.ready()

      expect(pool.dapiUrls).toEqual(TESTNET_SEEDS)
    })

    it('should replace the bootstrap seeds with discovered evonodes', async () => {
      getEvonodeList.mockResolvedValue([NODE_A, NODE_B, NODE_C])

      const pool = new GRPCConnectionPool('testnet')
      await pool.ready()

      await waitFor(() => pool.dapiUrls.length === 3)

      expect(pool.dapiUrls).toEqual([NODE_A, NODE_B, NODE_C])
    })

    it('should cap the evonode pool at poolLimit', async () => {
      getEvonodeList.mockResolvedValue([NODE_A, NODE_B, NODE_C, 'https://10.0.0.4:1443'])

      const pool = new GRPCConnectionPool('testnet', { poolLimit: 2 })
      await pool.ready()

      await waitFor(() => pool.dapiUrls.length === 2 && pool.dapiUrls.every(url => url.startsWith('https://10.0.0.')))

      expect(pool.dapiUrls).toEqual([NODE_A, NODE_B])
      expect(checkedUrls()).not.toContain('https://10.0.0.4:1443')
    })

    it('should keep the seeds when the evonodes are unhealthy', async () => {
      getEvonodeList.mockResolvedValue([NODE_A, NODE_B])
      nodeHealth.set(NODE_A, 'down')
      nodeHealth.set(NODE_B, 'down')

      const pool = new GRPCConnectionPool('testnet')
      await pool.ready()

      await waitFor(() => [NODE_A, NODE_B].every(url => checkedUrls().includes(url)))

      expect(pool.dapiUrls).toEqual(TESTNET_SEEDS)
    })

    it('should keep the seeds when only one evonode is healthy', async () => {
      getEvonodeList.mockResolvedValue([NODE_A, NODE_B])
      nodeHealth.set(NODE_B, 'down')

      const pool = new GRPCConnectionPool('testnet')
      await pool.ready()

      await waitFor(() => [NODE_A, NODE_B].every(url => checkedUrls().includes(url)))

      expect(pool.dapiUrls).toEqual(TESTNET_SEEDS)
    })
  })

  describe('getClient', () => {
    it('should round-robin over the nodes', async () => {
      const pool = new GRPCConnectionPool('testnet', { dapiUrl: [NODE_A, NODE_B] })

      const urls = []
      for (let i = 0; i < 4; i++) {
        urls.push((await pool.getClient() as unknown as MockClient).url)
      }

      expect(urls).toEqual([NODE_A, NODE_B, NODE_A, NODE_B])
    })

    it('should pass the abort controller to the client', async () => {
      const pool = new GRPCConnectionPool('testnet', { dapiUrl: NODE_A })
      const abortController = new AbortController()

      await pool.getClient(abortController)

      expect(createCoreClient).toHaveBeenLastCalledWith(NODE_A, abortController, expect.any(Function))
    })
  })

  describe('bans', () => {
    it('should skip a banned node and unban it on demand', async () => {
      const pool = new GRPCConnectionPool('testnet', { dapiUrl: [NODE_A, NODE_B] })

      const client = await pool.getClient()
      pool.banNode(client)

      expect((await pool.getClient() as unknown as MockClient).url).toBe(NODE_B)
      expect((await pool.getClient() as unknown as MockClient).url).toBe(NODE_B)

      pool.unbanNode(client)

      const urls = [
        (await pool.getClient() as unknown as MockClient).url,
        (await pool.getClient() as unknown as MockClient).url
      ]

      expect(urls).toEqual(expect.arrayContaining([NODE_A, NODE_B]))
    })

    it('should never ban the only node', async () => {
      const pool = new GRPCConnectionPool('testnet', { dapiUrl: NODE_A })

      const client = await pool.getClient()
      pool.banNode(client)

      expect((await pool.getClient() as unknown as MockClient).url).toBe(NODE_A)
    })

    it('should throw when all nodes are banned', async () => {
      const pool = new GRPCConnectionPool('testnet', { dapiUrl: [NODE_A, NODE_B] })

      pool.banNode(await pool.getClient())
      pool.banNode(await pool.getClient())

      await expect(pool.getClient()).rejects.toThrow('All 2 DAPI nodes are temporarily banned, no available nodes to send the request to')
    })

    it('should expire a ban after 60 seconds', async () => {
      const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000)
      const pool = new GRPCConnectionPool('testnet', { dapiUrl: [NODE_A, NODE_B] })

      pool.banNode(await pool.getClient())
      expect((await pool.getClient() as unknown as MockClient).url).toBe(NODE_B)

      now.mockReturnValue(1_000_000 + 60_001)

      expect((await pool.getClient() as unknown as MockClient).url).toBe(NODE_A)
    })

    it('should extend repeated bans exponentially', async () => {
      const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000)
      const pool = new GRPCConnectionPool('testnet', { dapiUrl: [NODE_A, NODE_B] })

      const client = await pool.getClient()
      pool.banNode(client)
      pool.banNode(client)

      now.mockReturnValue(1_000_000 + 61_000)
      expect((await pool.getClient() as unknown as MockClient).url).toBe(NODE_B)

      // second ban lasts 60s * e
      now.mockReturnValue(1_000_000 + 164_000)
      expect((await pool.getClient() as unknown as MockClient).url).toBe(NODE_A)
    })
  })

  describe('fetch retries', () => {
    it('should retry a failed request on the next node and ban the failed one', async () => {
      const pool = new GRPCConnectionPool('testnet', { dapiUrl: [NODE_A, NODE_B] })
      const client = await pool.getClient() as unknown as MockClient

      fetchSpy
        .mockRejectedValueOnce(connectError())
        .mockResolvedValueOnce(OK_RESPONSE)

      const init = { method: 'POST' }
      const response = await client.fetch(`${NODE_A}${METHOD_PATH}`, init)

      expect(response).toEqual({ ok: true })
      expect(fetchSpy.mock.calls.map(([url]) => url)).toEqual([`${NODE_A}${METHOD_PATH}`, `${NODE_B}${METHOD_PATH}`])
      expect(fetchSpy.mock.calls[1][1]).toBe(init)

      // the failed node is banned
      expect((await pool.getClient() as unknown as MockClient).url).toBe(NODE_B)
    })

    it('should track the node that served the retried request', async () => {
      const pool = new GRPCConnectionPool('testnet', { dapiUrl: [NODE_A, NODE_B, NODE_C] })
      const client = await pool.getClient()

      fetchSpy
        .mockRejectedValueOnce(connectError())
        .mockResolvedValueOnce(OK_RESPONSE)

      await (client as unknown as MockClient).fetch(`${NODE_A}${METHOD_PATH}`)

      // bans NODE_B (served the retry), not NODE_A; NODE_A is already banned by the failed fetch
      pool.banNode(client)

      expect((await pool.getClient() as unknown as MockClient).url).toBe(NODE_C)
    })

    it('should not retry a broadcast on a non-connect error', async () => {
      const pool = new GRPCConnectionPool('testnet', { dapiUrl: [NODE_A, NODE_B] })
      const client = await pool.getClient() as unknown as MockClient

      // ECONNRESET after the request was sent: the transaction may already be received
      const error = Object.assign(new TypeError('fetch failed'), {
        cause: Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' })
      })
      fetchSpy.mockRejectedValueOnce(error)

      await expect(client.fetch(`${NODE_A}${BROADCAST_PATH}`)).rejects.toThrow('fetch failed')
      expect(fetchSpy).toHaveBeenCalledTimes(1)
    })

    it('should retry a broadcast on a connect error', async () => {
      const pool = new GRPCConnectionPool('testnet', { dapiUrl: [NODE_A, NODE_B] })
      const client = await pool.getClient() as unknown as MockClient

      fetchSpy
        .mockRejectedValueOnce(connectError())
        .mockResolvedValueOnce(OK_RESPONSE)

      await client.fetch(`${NODE_A}${BROADCAST_PATH}`)

      expect(fetchSpy).toHaveBeenCalledTimes(2)
    })

    it('should not retry abort errors', async () => {
      const pool = new GRPCConnectionPool('testnet', { dapiUrl: [NODE_A, NODE_B] })
      const client = await pool.getClient() as unknown as MockClient

      fetchSpy.mockRejectedValueOnce(abortError())

      await expect(client.fetch(`${NODE_A}${METHOD_PATH}`)).rejects.toThrow('The operation was aborted')
      expect(fetchSpy).toHaveBeenCalledTimes(1)
    })

    it('should not retry when the request signal is aborted', async () => {
      const pool = new GRPCConnectionPool('testnet', { dapiUrl: [NODE_A, NODE_B] })
      const client = await pool.getClient() as unknown as MockClient

      const abortController = new AbortController()
      abortController.abort()
      fetchSpy.mockRejectedValueOnce(connectError())

      await expect(client.fetch(`${NODE_A}${METHOD_PATH}`, { signal: abortController.signal })).rejects.toThrow('fetch failed')
      expect(fetchSpy).toHaveBeenCalledTimes(1)
    })

    it('should stop after the configured retries', async () => {
      const pool = new GRPCConnectionPool('testnet', { dapiUrl: [NODE_A, NODE_B], retries: 1 })
      const client = await pool.getClient() as unknown as MockClient

      fetchSpy.mockRejectedValue(connectError())

      await expect(client.fetch(`${NODE_A}${METHOD_PATH}`)).rejects.toThrow('fetch failed')
      expect(fetchSpy).toHaveBeenCalledTimes(2)

      await expect(pool.getClient()).rejects.toThrow('All 2 DAPI nodes are temporarily banned')
    })

    it('should not retry when retries is zero', async () => {
      const pool = new GRPCConnectionPool('testnet', { dapiUrl: [NODE_A, NODE_B], retries: 0 })
      const client = await pool.getClient() as unknown as MockClient

      fetchSpy.mockRejectedValueOnce(connectError())

      await expect(client.fetch(`${NODE_A}${METHOD_PATH}`)).rejects.toThrow('fetch failed')
      expect(fetchSpy).toHaveBeenCalledTimes(1)
    })

    it('should fail when no other node is available', async () => {
      const pool = new GRPCConnectionPool('testnet', { dapiUrl: NODE_A })
      const client = await pool.getClient() as unknown as MockClient

      fetchSpy.mockRejectedValueOnce(connectError())

      await expect(client.fetch(`${NODE_A}${METHOD_PATH}`)).rejects.toThrow('fetch failed')
      expect(fetchSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('DashCoreSDK', () => {
    it('should resolve waitForInit once the seeds are healthchecked', async () => {
      const sdk = new DashCoreSDK({ network: 'testnet' })
      await sdk.waitForInit()

      expect(sdk.grpcConnectionPool.dapiUrls).toEqual(TESTNET_SEEDS)
    })

    it('should reject waitForInit when no seed is available', async () => {
      for (const seed of TESTNET_SEEDS) {
        nodeHealth.set(seed, 'down')
      }

      const sdk = new DashCoreSDK({ network: 'testnet' })

      await expect(sdk.waitForInit()).rejects.toThrow('None of the testnet seed nodes are available')
    })
  })
})
