import { jest } from '@jest/globals'

interface MockClient {
  url: string
  abortController?: AbortController
  fetch: typeof globalThis.fetch
  getBlockchainStatus: () => Promise<{ response: { syncProgress: number } }>
  subscribeToMasternodeList: () => { responses: AsyncIterable<unknown> }
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

const TESTNET_SEEDS = [
  'https://153.80.206.232:1443',
  'https://seed-1.testnet.networks.dash.org:1443',
  'https://68.67.122.1:1443'
]

const [SEED_A] = TESTNET_SEEDS

const NODE_A = 'https://10.0.0.1:1443'
const NODE_B = 'https://10.0.0.2:1443'
const NODE_C = 'https://10.0.0.3:1443'

const METHOD_PATH = '/org.dash.platform.dapi.v0.Core/getBlockchainStatus'
const BROADCAST_PATH = '/org.dash.platform.dapi.v0.Core/broadcastTransaction'

// 'ready' by default, 'syncing' answers an incomplete sync progress, 'down' throws
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

// Makes every seed healthcheck wait until the returned release function is called
const gateHealthChecks = (): (() => void) => {
  let release: () => void = () => {}
  const gate = new Promise<void>(resolve => { release = resolve })

  createCoreClient.mockImplementation((url, abortController, fetch) => ({
    url,
    abortController,
    fetch: fetch ?? globalThis.fetch,
    getBlockchainStatus: async () => {
      await gate
      return { response: { syncProgress: 1 } }
    },
    subscribeToMasternodeList: () => ({ responses: (async function * () {})() })
  }))

  return release
}

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

        return { response: { syncProgress: health === 'ready' ? 1 : 0.5 } }
      },
      subscribeToMasternodeList: () => ({ responses: (async function * () {})() })
    }))
  })

  afterEach(() => {
    jest.restoreAllMocks()
    jest.useRealTimers()
  })

  // Discovery is scheduled 2.5s after the first successful request, then runs in the background
  const discover = async (pool: InstanceType<typeof GRPCConnectionPool>): Promise<void> => {
    const client = await pool.getClient() as unknown as MockClient

    fetchSpy.mockResolvedValueOnce(OK_RESPONSE)
    await client.fetch(`${pool.dapiUrls[0]}${METHOD_PATH}`)

    await new Promise(resolve => setTimeout(resolve, 2700))
  }

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

    it('should resolve immediately with the primary seed, before healthchecks finish', async () => {
      const release = gateHealthChecks()
      const pool = new GRPCConnectionPool('testnet')

      await pool.ready()

      expect(pool.dapiUrls).toEqual([SEED_A])

      release()
      await new Promise(resolve => setImmediate(resolve))
    })

    it('should append healthy seeds in the background', async () => {
      const pool = new GRPCConnectionPool('testnet')
      await pool.ready()

      await waitFor(() => pool.dapiUrls.length >= 2)

      expect(pool.dapiUrls[0]).toBe(SEED_A)
      expect(pool.dapiUrls.length).toBeLessThanOrEqual(TESTNET_SEEDS.length)
    })

    it('should promote a fallback seed when the active node is banned', async () => {
      const release = gateHealthChecks()
      const pool = new GRPCConnectionPool('testnet')
      const client = await pool.getClient()

      expect(pool.dapiUrls).toEqual([SEED_A])

      pool.banNode(client)

      const next = await pool.getClient() as unknown as MockClient

      expect(next.url).not.toBe(SEED_A)
      expect(pool.dapiUrls).toContain(next.url)

      release()
      await new Promise(resolve => setImmediate(resolve))
    })

    it('should resolve even when no seed is healthy', async () => {
      for (const seed of TESTNET_SEEDS) {
        nodeHealth.set(seed, 'down')
      }

      const pool = new GRPCConnectionPool('testnet')
      await pool.ready()

      expect(pool.dapiUrls).toEqual([SEED_A])
    })

    it('should not query the masternode list during bootstrap', async () => {
      const release = gateHealthChecks()
      const pool = new GRPCConnectionPool('testnet')
      await pool.ready()

      expect(getEvonodeList).not.toHaveBeenCalled()

      release()
      await new Promise(resolve => setImmediate(resolve))
    })

    it('should discover evonodes in waves after the first successful request', async () => {
      const pool = new GRPCConnectionPool('testnet')
      await pool.ready()

      await discover(pool)

      // one wave over the seed list, not one request per seed at startup
      expect(getEvonodeList).toHaveBeenCalledTimes(TESTNET_SEEDS.length)

      for (const [, attempts, abortController] of getEvonodeList.mock.calls) {
        expect(attempts).toBe(1)
        expect(abortController).toBeInstanceOf(AbortController)
      }
    })

    it('should keep the pool when discovery fails', async () => {
      getEvonodeList.mockRejectedValue(new Error('discovery failed'))

      const pool = new GRPCConnectionPool('testnet')
      await pool.ready()
      await waitFor(() => pool.dapiUrls.length >= 2)

      const bootstrap = [...pool.dapiUrls]

      await discover(pool)

      expect(pool.dapiUrls).toEqual(bootstrap)
    })

    it('should replace the seeded pool with discovered evonodes', async () => {
      getEvonodeList.mockResolvedValue([NODE_A, NODE_B, NODE_C])

      const pool = new GRPCConnectionPool('testnet')
      await pool.ready()

      await discover(pool)
      await waitFor(() => pool.dapiUrls.length === 3 && pool.dapiUrls[0] === NODE_A)

      expect(pool.dapiUrls).toEqual([NODE_A, NODE_B, NODE_C])
    })

    it('should cap the evonode pool at poolLimit', async () => {
      getEvonodeList.mockResolvedValue([NODE_A, NODE_B, NODE_C, 'https://10.0.0.4:1443'])

      const pool = new GRPCConnectionPool('testnet', { poolLimit: 2 })
      await pool.ready()

      await discover(pool)
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
      await waitFor(() => pool.dapiUrls.length >= 2)

      const bootstrap = [...pool.dapiUrls]

      await discover(pool)
      await waitFor(() => [NODE_A, NODE_B].every(url => checkedUrls().includes(url)))

      expect(pool.dapiUrls).toEqual(bootstrap)
    })

    it('should keep the seeds when only one evonode is healthy', async () => {
      getEvonodeList.mockResolvedValue([NODE_A, NODE_B])
      nodeHealth.set(NODE_B, 'down')

      const pool = new GRPCConnectionPool('testnet')
      await pool.ready()
      await waitFor(() => pool.dapiUrls.length >= 2)

      const bootstrap = [...pool.dapiUrls]

      await discover(pool)
      await waitFor(() => [NODE_A, NODE_B].every(url => checkedUrls().includes(url)))

      expect(pool.dapiUrls).toEqual(bootstrap)
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
      expect(fetchSpy.mock.calls[1][1]).toMatchObject({ method: 'POST' })
      expect(fetchSpy.mock.calls[1][1]?.signal).toBeInstanceOf(AbortSignal)

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

  describe('request deadline', () => {
    it('should abort a silent node after requestTimeout and retry on the next node', async () => {
      const pool = new GRPCConnectionPool('testnet', { dapiUrl: [NODE_A, NODE_B], requestTimeout: 30 })
      const client = await pool.getClient() as unknown as MockClient

      fetchSpy.mockImplementation(async (url, init) => {
        if (String(url).startsWith(NODE_A)) {
          return await new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(abortError()))
          })
        }

        return OK_RESPONSE
      })

      const response = await client.fetch(`${NODE_A}${METHOD_PATH}`)

      expect(response).toEqual({ ok: true })
      expect(fetchSpy).toHaveBeenCalledTimes(2)
      // the abandoned request is aborted, freeing the connection
      expect(fetchSpy.mock.calls[0][1]?.signal?.aborted).toBe(true)
      // the silent node is banned
      expect((await pool.getClient() as unknown as MockClient).url).toBe(NODE_B)
    }, 2000)

    it('should abort a silent node after the default 10s deadline', async () => {
      jest.useFakeTimers()

      try {
        const pool = new GRPCConnectionPool('testnet', { dapiUrl: [NODE_A, NODE_B] })
        const client = await pool.getClient() as unknown as MockClient

        fetchSpy.mockImplementation(async (url, init) => {
          if (String(url).startsWith(NODE_A)) {
            return await new Promise<Response>((_resolve, reject) => {
              init?.signal?.addEventListener('abort', () => reject(abortError()))
            })
          }

          return OK_RESPONSE
        })

        const request = client.fetch(`${NODE_A}${METHOD_PATH}`)

        await jest.advanceTimersByTimeAsync(10_000)
        await jest.advanceTimersByTimeAsync(10)

        await expect(request).resolves.toEqual({ ok: true })
      } finally {
        jest.useRealTimers()
      }
    }, 2000)

    it('should abort the underlying fetch when the caller aborts, without retrying or banning', async () => {
      const pool = new GRPCConnectionPool('testnet', { dapiUrl: [NODE_A, NODE_B], requestTimeout: 5000 })
      const client = await pool.getClient() as unknown as MockClient
      const abortController = new AbortController()

      fetchSpy.mockImplementation(async (_url, init) => await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(abortError()))
      }))

      const request = client.fetch(`${NODE_A}${METHOD_PATH}`, { signal: abortController.signal })
      abortController.abort()

      await expect(request).rejects.toThrow('The operation was aborted')
      expect(fetchSpy).toHaveBeenCalledTimes(1)
      // the caller's signal is wrapped, but its abort still reaches the fetch
      expect(fetchSpy.mock.calls[0][1]?.signal).not.toBe(abortController.signal)
      expect(fetchSpy.mock.calls[0][1]?.signal?.aborted).toBe(true)
      // NODE_A is not banned
      expect((await pool.getClient() as unknown as MockClient).url).toBe(NODE_B)
      expect((await pool.getClient() as unknown as MockClient).url).toBe(NODE_A)
    }, 2000)

    it('should not apply the deadline to streams', async () => {
      const pool = new GRPCConnectionPool('testnet', { dapiUrl: NODE_A, requestTimeout: 30 })
      const client = await pool.getClient() as unknown as MockClient
      const streamPath = '/org.dash.platform.dapi.v0.Core/subscribeToMasternodeList'

      let resolveStream: (response: Response) => void = () => {}
      fetchSpy.mockImplementation(async () => await new Promise<Response>(resolve => {
        resolveStream = resolve
      }))

      const request = client.fetch(`${NODE_A}${streamPath}`)

      await new Promise(resolve => setTimeout(resolve, 80))

      expect(fetchSpy).toHaveBeenCalledTimes(1)
      expect(fetchSpy.mock.calls[0][1]?.signal?.aborted ?? false).toBe(false)

      resolveStream(OK_RESPONSE)
      await expect(request).resolves.toEqual({ ok: true })
    }, 2000)

    it('should not retry a broadcast that hit the deadline', async () => {
      const pool = new GRPCConnectionPool('testnet', { dapiUrl: [NODE_A, NODE_B], requestTimeout: 30 })
      const client = await pool.getClient() as unknown as MockClient

      fetchSpy.mockImplementation(async (_url, init) => await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(abortError()))
      }))

      await expect(client.fetch(`${NODE_A}${BROADCAST_PATH}`)).rejects.toMatchObject({ name: 'TimeoutError', message: 'Request timed out after 30ms' })
      expect(fetchSpy).toHaveBeenCalledTimes(1)
    }, 2000)

    it('should reject with a timeout error when the deadline exhausts the retries', async () => {
      const pool = new GRPCConnectionPool('testnet', { dapiUrl: [NODE_A, NODE_B], retries: 1, requestTimeout: 30 })
      const client = await pool.getClient() as unknown as MockClient

      fetchSpy.mockImplementation(async (_url, init) => await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(abortError()))
      }))

      await expect(client.fetch(`${NODE_A}${METHOD_PATH}`)).rejects.toMatchObject({ name: 'TimeoutError', message: 'Request timed out after 30ms' })
    }, 2000)

    it('should reject with a timeout error when no other node is available', async () => {
      const pool = new GRPCConnectionPool('testnet', { dapiUrl: NODE_A, requestTimeout: 30 })
      const client = await pool.getClient() as unknown as MockClient

      fetchSpy.mockImplementation(async (_url, init) => await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(abortError()))
      }))

      await expect(client.fetch(`${NODE_A}${METHOD_PATH}`)).rejects.toMatchObject({ name: 'TimeoutError', message: 'Request timed out after 30ms' })
    }, 2000)

    it('should reset the ban escalation after a successful request', async () => {
      const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000)
      const pool = new GRPCConnectionPool('testnet', { dapiUrl: [NODE_A, NODE_B] })

      pool.banNode(await pool.getClient())

      now.mockReturnValue(1_000_000 + 61_000)
      await pool.getClient()
      const recovered = await pool.getClient()

      fetchSpy.mockResolvedValueOnce(OK_RESPONSE)
      await (recovered as unknown as MockClient).fetch(`${NODE_A}${METHOD_PATH}`)

      pool.banNode(recovered)

      // the ban after a successful request lasts 60s again, not 60s * e
      now.mockReturnValue(1_000_000 + 61_000 + 61_000)

      const urls = [
        (await pool.getClient() as unknown as MockClient).url,
        (await pool.getClient() as unknown as MockClient).url
      ]

      expect(urls).toContain(NODE_A)
    })

    it.each([0, -1, 1.5])('should reject requestTimeout = %s', (requestTimeout) => {
      expect(() => new GRPCConnectionPool('testnet', { requestTimeout })).toThrow('GRPC requestTimeout must be a positive integer')
    })

    it('should default requestTimeout to 10 seconds', () => {
      const pool = new GRPCConnectionPool('testnet', { dapiUrl: NODE_A })

      expect(pool.requestTimeout).toBe(10_000)
    })
  })

  describe('DashCoreSDK', () => {
    it('should resolve waitForInit without waiting for healthchecks', async () => {
      const release = gateHealthChecks()
      const sdk = new DashCoreSDK({ network: 'testnet' })

      await sdk.waitForInit()

      expect(sdk.grpcConnectionPool.dapiUrls).toEqual([SEED_A])

      release()
      await new Promise(resolve => setImmediate(resolve))
    })

    it('should resolve waitForInit even when no seed is available', async () => {
      for (const seed of TESTNET_SEEDS) {
        nodeHealth.set(seed, 'down')
      }

      const sdk = new DashCoreSDK({ network: 'testnet' })

      await expect(sdk.waitForInit()).resolves.toBeUndefined()
      expect(sdk.grpcConnectionPool.dapiUrls).toEqual([SEED_A])
    })

    it('should pass requestTimeout to the pool', () => {
      const sdk = new DashCoreSDK({ network: 'testnet', requestTimeout: 1234 })

      expect(sdk.grpcConnectionPool.requestTimeout).toBe(1234)
    })

    it('should pass the abort controller to subscribeToMasternodeList', async () => {
      const sdk = new DashCoreSDK({ network: 'testnet', dapiUrl: NODE_A })
      const abortController = new AbortController()

      await sdk.subscribeToMasternodeList(abortController)

      expect(createCoreClient).toHaveBeenLastCalledWith(NODE_A, abortController, expect.any(Function))
    })
  })
})
