import getEvonodeList from './getEvonodeList.js'
import createCoreClient from './createCoreClient.js'
import { CoreClient } from '../proto/generated/core.client.js'
import { GetBlockchainStatusRequest, GetBlockchainStatusResponse_Status } from '../proto/generated/core.js'
import { fetchWithDetails } from './fetchWithDetails.js'
import { wait } from './utils.js'
import { GRPC_DEFAULT_POOL_LIMIT } from './constants.js'

const GRPC_DEFAULT_CONNECT_RETRIES = 5
// first ban lasts 60 seconds, every next ban without a successful request in between lasts e times longer
const NODE_BASE_BAN_PERIOD_MS = 60 * 1000
const RETRY_DELAY_MS = 10

export interface GRPCOptions {
  poolLimit?: number
  dapiUrl?: string | string[]
  retries?: number
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
    'https://34.209.12.72:1443',
    // Testnet validators (hp-masternode-1 -> hp-masternode-15)
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
  ],
  mainnet: [
    // seed-1.pshenmic.dev
    'https://153.80.206.97:443',
    // DCG seed
    'https://34.211.174.194:443',
    // validator
    'https://95.216.146.18:443'
  ]
}

const HEALTHCHECK_TIMEOUT_MS = 3000

// Per-client concurrency × clients initializing at once is the instantaneous load on nodes,
// so healthchecks run a small window at a time to avoid a fleet-wide request burst.
const HEALTHCHECK_CONCURRENCY = 2
// Init resolves at this many healthy nodes; seeds only bootstrap the pool and are replaced
// by discovered evonodes, so they never stay in the long-lived pool.
const HEALTHCHECK_MIN_HEALTHY_NODES = 2

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
const withTimeout = async <T>(request: (abortController: AbortController) => Promise<T>, timeoutMs = HEALTHCHECK_TIMEOUT_MS): Promise<T> => {
  const abortController = new AbortController()
  const timeout = setTimeout(() => abortController.abort(), timeoutMs)

  try {
    return await request(abortController)
  } finally {
    clearTimeout(timeout)
  }
}

const isNodeHealthy = async (url: string, signal?: AbortSignal): Promise<boolean> => {
  try {
    const { response } = await withTimeout(async abortController => {
      signal?.addEventListener('abort', () => abortController.abort())

      return await createCoreClient(url, abortController).getBlockchainStatus(GetBlockchainStatusRequest.create({}))
    })

    return response.status === GetBlockchainStatusResponse_Status.READY
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
  #nodeIndex = 0
  #initialization?: Promise<void>
  // ban state of nodes that failed with a retryable error, banned nodes are skipped on node selection
  #bans = new Map<string, { bannedTimes: number, bannedUntil: number }>()
  // node that served (or is serving) the request of the client
  #clientNodes = new WeakMap<CoreClient, string>()

  constructor (network: 'testnet' | 'mainnet', grpcOptions?: GRPCOptions) {
    const retries = grpcOptions?.retries ?? GRPC_DEFAULT_CONNECT_RETRIES

    if (!Number.isInteger(retries) || retries < 0) {
      throw new Error(`GRPC retries must be a non-negative integer, got ${String(retries)}`)
    }

    this.network = network
    this.#poolLimit = grpcOptions?.poolLimit ?? GRPC_DEFAULT_POOL_LIMIT
    this.#dapiUrl = grpcOptions?.dapiUrl
    this.retries = retries

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

    // Race all seeds for discovery; the first successful response wins and the losers are
    // aborted. If every seed fails, init rejects with "no peers" (the original contract).
    const evonodeListPromise = async (): Promise<string[]> => {
      const winner = new AbortController()

      try {
        return await Promise.any(seedNodes[network].map(async seed =>
          await withTimeout(async abortController => {
            winner.signal.addEventListener('abort', () => abortController.abort())

            return await getEvonodeList([seed], 1, abortController)
          })))
      } catch (e) {
        const errors = (e as AggregateError).errors
        throw new AggregateError(errors, `None of the ${network} seed nodes are available: ${errors.map(String).join('; ')}`)
      } finally {
        winner.abort()
      }
    }

    // Bootstrap the pool by racing all seed healthchecks; resolve at the first K healthy
    // and abort the rest, so a slow/dead seed never stalls initialization.
    const seeds = seedNodes[network]
    const healthySeeds: string[] = []

    const bootstrapPromise = new Promise<void>((resolve, reject) => {
      const race = new AbortController()
      let pending = seeds.length

      seeds.forEach(seed => {
        void isNodeHealthy(seed, race.signal).then(healthy => {
          if (healthy) {
            healthySeeds.push(seed)

            if (healthySeeds.length >= HEALTHCHECK_MIN_HEALTHY_NODES) {
              race.abort()
              resolve()
            }
          }

          pending -= 1
          if (pending === 0) {
            if (healthySeeds.length === 0) {
              reject(new Error(`None of the ${network} seed nodes are available (nodes must be synced)`))
            } else {
              resolve()
            }
          }
        })
      })
    })

    // Discovery failure fails initialization with "no peers", exactly as before.
    const [, evonodeUrls] = await Promise.all([bootstrapPromise, evonodeListPromise()])

    this.dapiUrls = [...healthySeeds]

    // Replace the bootstrap seeds with discovered evonodes in the background.
    void (async () => {
      const evonodes = shuffle([...new Set(evonodeUrls)])
      const healthyEvonodes: string[] = []
      let evonodeIndex = 0

      const checkEvonode = async (): Promise<void> => {
        while (evonodeIndex < evonodes.length && healthyEvonodes.length < this.#poolLimit) {
          const url = evonodes[evonodeIndex++]

          if (await isNodeHealthy(url)) {
            healthyEvonodes.push(url)

            // Evict the bootstrap seeds once enough evonodes are healthy.
            if (healthyEvonodes.length >= HEALTHCHECK_MIN_HEALTHY_NODES) {
              this.dapiUrls = healthyEvonodes.slice(0, this.#poolLimit)
            }
          }
        }
      }

      await Promise.all(Array.from({ length: HEALTHCHECK_CONCURRENCY }, async () => await checkEvonode()))
    })().catch(() => {
      // keep the bootstrap seeds if evonode healthchecks fail
    })
  }

  /**
   * Waits for the pool initialization, a failed attempt is retried on the next call
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
    if (this.dapiUrls.length <= 1) {
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
      const triedUrls = [dapiUrl]
      let nodeUrl = dapiUrl

      for (let retry = 0; ; retry++) {
        try {
          return await fetchWithDetails(`${nodeUrl}${methodPath}`, init)
        } catch (e) {
          // the transaction could already be received by the node,
          // so broadcast is retried only if the connection was not established
          const isRetryable = methodPath.includes('broadcast') ? isConnectError(e) : !isAbortError(e)

          if (!isRetryable || init?.signal?.aborted === true) {
            throw e
          }

          this.#ban(nodeUrl)

          if (retry >= this.retries) {
            throw e
          }

          await wait(RETRY_DELAY_MS)

          const nextUrl = init?.signal?.aborted !== true ? this.#nextNode(triedUrls) : undefined

          if (nextUrl == null) {
            throw e
          }

          triedUrls.push(nextUrl)
          nodeUrl = nextUrl
          onNodeChange(nextUrl)
        }
      }
    }
  }
}
