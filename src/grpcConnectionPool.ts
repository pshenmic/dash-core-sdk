import getEvonodeList from './getEvonodeList.js'
import createCoreClient from './createCoreClient.js'
import { getRandomArrayItem } from './utils.js'
import { CoreClient } from '../proto/generated/core.client.js'
import { GetBlockchainStatusRequest, GetBlockchainStatusResponse_Status } from '../proto/generated/core.js'
import { GRPC_DEFAULT_POOL_LIMIT, POOL_REFRESH_COOLDOWN } from './constants.js'

export type MasternodeList = Record<string, MasternodeInfo>
export interface GRPCOptions {
  poolLimit: number
  dapiUrl?: string | string[]
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
    'https://158.160.14.115:1443'
  ],
  mainnet: [
    // seed-1.pshenmic.dev
    'https://158.160.14.115:443'
    // mainnet dcg seeds
    // 'https://158.160.14.115',
    // 'https://3.0.60.103',
    // 'https://34.211.174.194'
  ]
}

export default class GRPCConnectionPool {
  dapiUrls: string[] = []
  network: 'testnet' | 'mainnet'
  poolLimit: number

  // Explicitly configured URLs outrank discovery, so a refresh must leave them alone
  _pinned: boolean = false
  _initialization: Promise<void>
  _refresh: Promise<void> | null = null
  _lastRefreshAt: number = 0

  constructor (network: 'testnet' | 'mainnet', grpcOptions?: GRPCOptions) {
    const grpcPoolLimit = grpcOptions?.poolLimit ?? GRPC_DEFAULT_POOL_LIMIT

    this.network = network
    this.poolLimit = grpcPoolLimit

    this._initialization = this._initialize(network, grpcPoolLimit, grpcOptions?.dapiUrl).catch(console.error)
  }

  /**
   * Resolve once the initial discovery round has settled.
   *
   * Initialization is fire and forget, so callers that must not race it can
   * await this instead of sleeping. It never rejects — a failed lookup leaves
   * the pool on the seed nodes and is recovered from in getClient.
   */
  async ready (): Promise<void> {
    await this._initialization
  }

  async _initialize (network: 'testnet' | 'mainnet', poolLimit: number, dapiUrl?: string | string[]): Promise<void> {
    if (typeof dapiUrl === 'string') {
      this.dapiUrls = [dapiUrl]
      this._pinned = true

      return
    }

    if (Array.isArray(dapiUrl)) {
      this.dapiUrls = dapiUrl
      this._pinned = true

      return
    }

    if (dapiUrl != null) {
      throw new Error('Unrecognized DAPI URL')
    }

    // Keep the pool usable while discovery is still in flight
    this.dapiUrls = [...seedNodes[network]]

    await this._discover(network, poolLimit)
  }

  /**
   * Rebuild the pool from the current evonode list.
   *
   * The new list is assembled in a local array and swapped in at the end so a
   * concurrent getClient never observes a half filled pool.
   *
   * @param network - target Dash network
   * @param poolLimit - maximum number of nodes to keep
   */
  async _discover (network: 'testnet' | 'mainnet', poolLimit: number): Promise<void> {
    // Query through the nodes already known, so discovery never depends on a
    // third-party index being reachable
    const evonodeUrls = await getEvonodeList([...this.dapiUrls])

    const dapiUrls = [...seedNodes[network]]

    // healthcheck nodes
    for (const url of evonodeUrls) {
      if (dapiUrls.length >= poolLimit) {
        break
      }

      try {
        const client = createCoreClient(url)

        const { response } = await client.getBlockchainStatus(GetBlockchainStatusRequest.fromJson({}))

        if (response.status === GetBlockchainStatusResponse_Status.READY) {
          dapiUrls.push(url)
        }
      } catch (e) {
      }
    }

    this.dapiUrls = dapiUrls
  }

  /**
   * Whether the pool never got past its seed nodes.
   *
   * A seed node lags the mempool, and with a single URL the random pick
   * degenerates, so every retry hits the same lagging node and freshly
   * broadcast transactions read back as "not found".
   */
  _isDegraded (): boolean {
    const seeds: string[] = seedNodes[this.network]

    return this.dapiUrls.every((url) => seeds.includes(url))
  }

  /**
   * Start a discovery round without blocking the caller.
   *
   * Skipped for a pinned pool, while a round is already in flight, and during
   * the cooldown, so a burst of getClient calls costs a single lookup.
   * Failures are swallowed the same way the constructor swallows them.
   */
  _refreshInBackground (): void {
    if (this._pinned || this._refresh != null) {
      return
    }

    if (this._lastRefreshAt !== 0 && Date.now() - this._lastRefreshAt < POOL_REFRESH_COOLDOWN) {
      return
    }

    this._lastRefreshAt = Date.now()

    this._refresh = this._discover(this.network, this.poolLimit)
      .catch(console.error)
      .finally(() => {
        this._lastRefreshAt = Date.now()
        this._refresh = null
      })
  }

  /**
   * Pick a random node from the pool.
   *
   * @param abortController - optional controller aborting the client's calls
   */
  getClient (abortController?: AbortController): CoreClient {
    if (this._isDegraded()) {
      this._refreshInBackground()
    }

    const dapiUrl = getRandomArrayItem(this.dapiUrls)

    return createCoreClient(dapiUrl, abortController)
  }
}
