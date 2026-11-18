import getEvonodeList from './getEvonodeList.js'
import createCoreClient from './createCoreClient.js'
import { CoreClient } from '../proto/generated/core.client.js'
import { GetBlockchainStatusRequest } from '../proto/generated/core.js'
import { fetchWithDetails } from './fetchWithDetails.js'
import { wait } from './utils.js'
import { GRPC_DEFAULT_POOL_LIMIT } from './constants.js'

const GRPC_DEFAULT_CONNECT_RETRIES = 5
// first ban lasts 60 seconds, every next ban without a successful request in between lasts e times longer
const NODE_BASE_BAN_PERIOD_MS = 60 * 1000
const RETRY_DELAY_MS = 10
const GRPC_DEFAULT_REQUEST_TIMEOUT_MS = 10 * 1000

export interface GRPCOptions {
  poolLimit?: number
  dapiUrl?: string | string[]
  retries?: number
  /**
   * Deadline of a single request attempt in milliseconds, the request is aborted and retried on another node when it expires.
   * Streams are not limited by it. Default is 10 seconds
   */
  requestTimeout?: number
}

export interface MasternodeInfo {
  proTxHash: string
  address: string
  payee: string
  status: string
  type: string
  platformNodeID: string
  platformP2PPort: number
  platformHTTPPort: number
  pospenaltyscore: number
  consecutivePayments: number
  lastpaidtime: number
  lastpaidblock: number
  owneraddress: string
  votingaddress: string
  collateraladdress: string
  pubkeyoperator: string
}

const seedNodes = {
  testnet: [
    // seed-1.pshenmic.dev
    'https://153.80.206.232:1443',
    // DCG seed
    'https://seed-1.testnet.networks.dash.org:1443',
    // Testnet validator
    'https://68.67.122.1:1443'
  ],
  mainnet: [
    // seed-1.pshenmic.dev
    'https://153.80.206.97:443',
    // DCG seed
    'https://seed-1.mainnet.networks.dash.org:443',
    // validator
    'https://95.216.146.18:443'
  ]
}

// Initialization is optimistic: the seeds are used right away and the first real request is the
// healthcheck. A failed node is banned and the request is retried on another one by the fetch
// wrapper, so there is no need to probe every seed before serving a query.
//
// Evonode discovery runs in small waves after the first successful request, so it never delays
// or competes with the first queries. Discovered evonodes are still healthchecked before they
// replace the seeds, so the long-lived pool does not fill up with slow or lagging nodes.
const SEED_DISCOVERY_BATCH = 4
const SEED_DISCOVERY_WAVES = 2
const SEED_DISCOVERY_TIMEOUT_MS = 4000
const SEED_DISCOVERY_DELAY_MS = 2500

// Only a handful of seeds is checked before the first request. Resolving at the first two
// healthy nodes keeps the initial pool small and known-good, instead of spraying the first
// parallel batch over every seed (including dead or slow ones).
const BOOTSTRAP_SEED_COUNT = 6
const BOOTSTRAP_TIMEOUT_MS = 2500
const BOOTSTRAP_MIN_HEALTHY = 2

const VALIDATOR_CHECK_TIMEOUT_MS = 3000
// Per-client concurrency × clients initializing at once is the instantaneous load on nodes,
// so healthchecks run a small window at a time to avoid a fleet-wide request burst.
const VALIDATOR_CHECK_CONCURRENCY = 2
// The pool keeps serving requests with the seeds until this many evonodes are healthy.
const VALIDATOR_CHECK_MIN_HEALTHY = 2

const isAbortError = (error: unknown): boolean => error instanceof Error && error.name === 'AbortError'

// errors raised before the request is sent to the node, so it is always safe to send it to another node
const CONNECT_ERROR_CODES = ['UND_ERR_CONNECT_TIMEOUT', 'ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH', 'EHOSTDOWN', 'ENETDOWN']

/**
 * Checks if the error (or one of its causes) means that the connection to the node could not be established
 */
const isConnectError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false
  }

  const { code } = error as { code?: unknown }

  // ECONNRESET is a connect error only if the connection was reset during the TLS handshake,
  // otherwise it may happen after the request was sent
  return CONNECT_ERROR_CODES.includes(String(code)) ||
    (code === 'ECONNRESET' && error.message.includes('before secure TLS connection was established')) ||
    isConnectError(error.cause)
}

/**
 * Runs a request with an AbortController that is aborted after the given timeout
 */
const withTimeout = async <T>(request: (abortController: AbortController) => Promise<T>, timeoutMs = VALIDATOR_CHECK_TIMEOUT_MS): Promise<T> => {
  const abortController = new AbortController()
  let timeout: ReturnType<typeof setTimeout> | undefined

  try {
    // Race with a rejection as well: aborting a fetch is not guaranteed to settle the
    // promise, e.g. while the TLS handshake is stuck, and init must never hang.
    return await Promise.race([
      request(abortController),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          abortController.abort()
          reject(new Error(`Request timed out after ${timeoutMs}ms`))
        }, timeoutMs)
      })
    ])
  } finally {
    if (timeout != null) {
      clearTimeout(timeout)
    }
  }
}

/**
 * Runs the callback after a short delay, without blocking the first requests.
 * A timer is used (instead of requestIdleCallback) so discovery still happens when the
 * page keeps making requests and never goes idle.
 */
const later = (callback: () => void): void => {
  setTimeout(callback, SEED_DISCOVERY_DELAY_MS)
}

const isNodeHealthy = async (url: string, signal?: AbortSignal, timeoutMs = VALIDATOR_CHECK_TIMEOUT_MS): Promise<boolean> => {
  try {
    const response = await withTimeout(async abortController => {
      signal?.addEventListener('abort', () => abortController.abort())

      const { response } = await createCoreClient(url, abortController).getBlockchainStatus(GetBlockchainStatusRequest.create({}))

      return response
    }, timeoutMs)

    return response.syncProgress >= 0.9999
  } catch (e) {
    return false
  }
}

// Fisher–Yates shuffle
// Randomly shuffles the elements inside of array, having previously cloned it.
const shuffle = <T>(array: T[]): T[] => {
  const result = [...array]

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }

  return result
}

export default class GRPCConnectionPool {
  dapiUrls: string[] = []
  network: 'testnet' | 'mainnet'
  #poolLimit: number
  #dapiUrl?: string | string[]
  readonly retries: number
  readonly requestTimeout: number
  #nodeIndex = 0
  #initialization?: Promise<void>
  #discoveryScheduled = false
  // Known seeds that are not in the active pool yet, used only when the active nodes fail
  #fallbackUrls: string[] = []
  // ban state of nodes that failed with a retryable error, banned nodes are skipped on node selection
  #bans = new Map<string, { bannedTimes: number, bannedUntil: number }>()
  // node that served (or is serving) the request of the client
  #clientNodes = new WeakMap<CoreClient, string>()

  constructor (network: 'testnet' | 'mainnet', grpcOptions?: GRPCOptions) {
    const retries = grpcOptions?.retries ?? GRPC_DEFAULT_CONNECT_RETRIES

    if (!Number.isInteger(retries) || retries < 0) {
      throw new Error(`GRPC retries must be a non-negative integer, got ${String(retries)}`)
    }

    const requestTimeout = grpcOptions?.requestTimeout ?? GRPC_DEFAULT_REQUEST_TIMEOUT_MS

    if (!Number.isInteger(requestTimeout) || requestTimeout <= 0) {
      throw new Error(`GRPC requestTimeout must be a positive integer, got ${String(requestTimeout)}`)
    }

    this.network = network
    this.#poolLimit = grpcOptions?.poolLimit ?? GRPC_DEFAULT_POOL_LIMIT
    this.#dapiUrl = grpcOptions?.dapiUrl
    this.retries = retries
    this.requestTimeout = requestTimeout

    // start initialization in the background, failures are reported on the first request
    this.#initialization = this.#initializePool()
    this.#initialization.catch(() => {})
  }

  async #initializePool (): Promise<void> {
    const { network } = this

    if (this.#dapiUrl != null) {
      if (typeof this.#dapiUrl !== 'string' && !Array.isArray(this.#dapiUrl)) {
        throw new Error('Unrecognized DAPI URL')
      }

      // trailing slash is removed, so the GRPC method path can be appended to the url
      this.dapiUrls = [...new Set([this.#dapiUrl].flat().map(url => url.replace(/\/+$/, '')))]

      if (this.dapiUrls.length === 0) {
        throw new Error('DAPI URL list is empty')
      }

      return
    }

    // Start with the primary seed right away. The first request doubles as the healthcheck and
    // failing nodes are retried from the fallback list below, so init never waits for a network
    // round trip. Healthy seeds are appended in the background to give the pool some fan-out.
    const seeds = [seedNodes[network][0], ...shuffle(seedNodes[network].slice(1))]
    this.dapiUrls = [seeds[0]]
    this.#fallbackUrls = seeds.slice(1)

    void this.#bootstrapSeeds(seeds.slice(0, BOOTSTRAP_SEED_COUNT)).then(healthySeeds => {
      for (const url of healthySeeds) {
        if (!this.dapiUrls.includes(url)) {
          this.dapiUrls.push(url)
        }
      }
    }).catch(() => {
      // keep serving from the primary seed and the fallback list
    })
  }

  /**
   * Races a small set of seeds and resolves at the first two healthy ones.
   * A slow seed cannot hold initialization: the race aborts as soon as enough nodes are found.
   */
  async #bootstrapSeeds (candidates: string[]): Promise<string[]> {
    const healthySeeds: string[] = []

    if (candidates.length === 0) {
      return healthySeeds
    }

    const race = new AbortController()
    let deadline: ReturnType<typeof setTimeout> | undefined
    // Once the race is decided, late responses must not change the bootstrap set
    let settled = false

    try {
      await Promise.race([
        new Promise<void>(resolve => {
          let pending = candidates.length

          for (const seed of candidates) {
            void isNodeHealthy(seed, race.signal, BOOTSTRAP_TIMEOUT_MS).then(healthy => {
              if (settled) {
                return
              }

              if (healthy) {
                healthySeeds.push(seed)

                if (healthySeeds.length >= BOOTSTRAP_MIN_HEALTHY) {
                  settled = true
                  race.abort()
                  resolve()
                  return
                }
              }

              pending -= 1
              if (pending === 0) {
                settled = true
                resolve()
              }
            })
          }
        }),
        // Hard deadline: init resolves with whatever healthy seeds were found, even if a
        // node connection never settles after the abort.
        new Promise<void>(resolve => {
          deadline = setTimeout(resolve, BOOTSTRAP_TIMEOUT_MS + 500)
        })
      ])
    } finally {
      settled = true
      race.abort()

      if (deadline != null) {
        clearTimeout(deadline)
      }
    }

    return [...healthySeeds]
  }

  /**
   * Starts evonode discovery once, after the first request had a chance to complete.
   * It is a background job: the pool keeps serving requests from the seeds meanwhile.
   */
  #scheduleDiscovery (): void {
    if (this.#discoveryScheduled || this.#dapiUrl != null) {
      return
    }

    this.#discoveryScheduled = true

    later(() => {
      void this.#discoverEvonodes().catch(() => {
        // keep using the seeds if discovery fails
      })
    })
  }

  /**
   * Fetches the current evonode list, healthchecks its nodes and replaces the seeds with
   * the healthy evonodes. The checks run here, off the critical path, so the first requests
   * are never delayed by them and the long-lived pool does not fill up with lagging nodes.
   */
  async #discoverEvonodes (): Promise<void> {
    const evonodeUrls = await this.#fetchEvonodeList()

    if (evonodeUrls.length === 0) {
      return
    }

    const healthyEvonodes: string[] = []
    let evonodeIndex = 0

    const checkEvonode = async (): Promise<void> => {
      while (evonodeIndex < evonodeUrls.length && healthyEvonodes.length < this.#poolLimit) {
        const url = evonodeUrls[evonodeIndex++]

        if (await isNodeHealthy(url)) {
          healthyEvonodes.push(url)

          // Replace the seeds once enough evonodes are healthy, so a single slow node
          // cannot hold the whole pool. Otherwise the seeds stay as a fallback.
          if (healthyEvonodes.length >= VALIDATOR_CHECK_MIN_HEALTHY) {
            this.dapiUrls = healthyEvonodes.slice(0, this.#poolLimit)
          }
        }
      }
    }

    await Promise.all(Array.from({ length: VALIDATOR_CHECK_CONCURRENCY }, async () => await checkEvonode()))
  }

  /**
   * Reads the evonode list from the first responding seed. Seeds are tried in small waves,
   * so a single round of discovery does not open a stream to every seed at once.
   */
  async #fetchEvonodeList (): Promise<string[]> {
    const seeds = shuffle([...seedNodes[this.network]])
    const maxSeeds = Math.min(seeds.length, SEED_DISCOVERY_BATCH * SEED_DISCOVERY_WAVES)
    let lastError: unknown

    for (let i = 0; i < maxSeeds; i += SEED_DISCOVERY_BATCH) {
      const batch = seeds.slice(i, i + SEED_DISCOVERY_BATCH)
      // One controller cancels the losing streams as soon as one seed answers
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), SEED_DISCOVERY_TIMEOUT_MS)

      try {
        return await Promise.any(batch.map(async seed => await getEvonodeList([seed], 1, controller)))
      } catch (e) {
        lastError = e
      } finally {
        clearTimeout(timeout)
        controller.abort()
      }
    }

    const errors = (lastError as AggregateError | undefined)?.errors ?? [lastError]
    throw new AggregateError(errors, `None of the ${this.network} seed nodes are available: ${errors.map(String).join('; ')}`)
  }

  /**
   * Waits for the seed bootstrap. Evonode discovery continues in the background after it resolves.
   * A failed attempt is retried on the next call.
   */
  async ready (): Promise<void> {
    // retry initialization if the previous attempt failed
    this.#initialization ??= this.#initializePool()

    const initialization = this.#initialization

    try {
      await initialization
    } catch (e) {
      // other callers may have already started a new attempt
      if (this.#initialization === initialization) {
        this.#initialization = undefined
      }

      throw e
    }
  }

  /**
   * Waits for the pool initialization and returns a client connected to the next healthy node (round-robin)
   */
  async getClient (abortController?: AbortController): Promise<CoreClient> {
    await this.ready()

    if (this.dapiUrls.length === 0) {
      throw new Error('DAPI URL list is empty')
    }

    const dapiUrl = this.#nextNode()

    if (dapiUrl == null) {
      throw new Error(`All ${this.dapiUrls.length} DAPI nodes are temporarily banned, no available nodes to send the request to`)
    }

    const client: CoreClient = createCoreClient(dapiUrl, abortController, this.#createFetchWithRetry(dapiUrl, url => this.#clientNodes.set(client, url)))

    this.#clientNodes.set(client, dapiUrl)

    return client
  }

  /**
   * Bans the node that served the request of the client, e.g. when it returned an invalid response.
   * The first ban lasts 60 seconds, every next ban lasts e times longer, until the node is unbanned
   */
  banNode (client: CoreClient): void {
    const url = this.#clientNodes.get(client)

    if (url != null) {
      this.#ban(url)
    }
  }

  /**
   * Unbans the node that served the request of the client and resets its ban period,
   * should be called once the response of the node was successfully verified
   */
  unbanNode (client: CoreClient): void {
    const url = this.#clientNodes.get(client)

    if (url != null) {
      this.#bans.delete(url)
    }
  }

  #ban (url: string): void {
    // a single node is never banned, otherwise the pool would have no nodes to send requests to
    if (this.dapiUrls.length + this.#fallbackUrls.length <= 1) {
      return
    }

    const bannedTimes = this.#bans.get(url)?.bannedTimes ?? 0

    this.#bans.set(url, {
      bannedTimes: bannedTimes + 1,
      bannedUntil: Date.now() + NODE_BASE_BAN_PERIOD_MS * Math.exp(bannedTimes)
    })
  }

  #isBanned (url: string): boolean {
    const ban = this.#bans.get(url)

    return ban != null && ban.bannedUntil > Date.now()
  }

  /**
   * Returns the next node from the pool in round-robin order, skipping the excluded and banned nodes.
   * Every request and every retry moves to the next node, so the load is spread evenly
   */
  #nextNode (exclude: string[] = []): string | undefined {
    for (let i = 0; i < this.dapiUrls.length; i++) {
      // index+1 and drop to 0 when #nodeIndex == this.dapiUrls.length
      const url = this.dapiUrls[this.#nodeIndex++ % this.dapiUrls.length]

      if (!exclude.includes(url) && !this.#isBanned(url)) {
        return url
      }
    }

    // Every active node is banned or already tried: promote a fallback seed into the pool.
    // This keeps the first batch on the primary node while preserving failover.
    const fallback = this.#fallbackUrls.find(url => !exclude.includes(url) && !this.#isBanned(url))

    if (fallback != null) {
      this.#fallbackUrls = this.#fallbackUrls.filter(url => url !== fallback)
      this.dapiUrls.push(fallback)
      return fallback
    }

    return undefined
  }

  /**
   * Creates a fetch for the client of the given node, that retries the request
   * on other nodes from the pool if it failed with a network error.
   * The failed node is banned, `onNodeChange` is called with the node the request is retried on
   */
  #createFetchWithRetry (dapiUrl: string, onNodeChange: (url: string) => void): typeof globalThis.fetch {
    return async (input, init) => {
      // transport always requests `${dapiUrl}/${service}/${method}`
      const methodPath = String(input).slice(dapiUrl.length)
      // streams are long-lived and must not get a deadline, they are aborted only by the caller's signal
      const hasDeadline = !methodPath.includes('subscribe')
      const outerSignal = init?.signal
      const triedUrls = [dapiUrl]
      let nodeUrl = dapiUrl

      for (let retry = 0; ; retry++) {
        const abortController = hasDeadline ? new AbortController() : undefined
        const onOuterAbort = (): void => abortController?.abort()
        const timeout = hasDeadline ? setTimeout(() => abortController?.abort(), this.requestTimeout) : undefined

        if (abortController != null) {
          outerSignal?.addEventListener('abort', onOuterAbort)

          if (outerSignal?.aborted === true) {
            abortController.abort()
          }
        }

        try {
          const response = await fetchWithDetails(`${nodeUrl}${methodPath}`, abortController != null ? { ...init, signal: abortController.signal } : init)

          // a successful request resets the ban escalation of the node
          this.#bans.delete(nodeUrl)

          // The first served request doubles as the seed healthcheck; start the
          // background evonode discovery only after it succeeded.
          this.#scheduleDiscovery()

          return response
        } catch (e) {
          // the deadline abort is retryable, the caller's abort is not
          const timedOut = abortController?.signal.aborted === true && outerSignal?.aborted !== true
          // surface the expired deadline as a timeout error instead of a bare abort
          const error = timedOut
            ? Object.assign(new Error(`Request timed out after ${this.requestTimeout}ms`, { cause: e }), { name: 'TimeoutError' })
            : e
          // the transaction could already be received by the node,
          // so broadcast is retried only if the connection was not established
          const isRetryable = methodPath.includes('broadcast') ? isConnectError(e) : (!isAbortError(e) || timedOut)

          if (!isRetryable || outerSignal?.aborted === true) {
            throw error
          }

          this.#ban(nodeUrl)

          if (retry >= this.retries) {
            throw error
          }

          await wait(RETRY_DELAY_MS)

          const nextUrl = outerSignal?.aborted !== true ? this.#nextNode(triedUrls) : undefined

          if (nextUrl == null) {
            throw error
          }

          triedUrls.push(nextUrl)
          nodeUrl = nextUrl
          onNodeChange(nextUrl)
        } finally {
          clearTimeout(timeout)

          if (abortController != null) {
            outerSignal?.removeEventListener('abort', onOuterAbort)
          }
        }
      }
    }
  }
}
