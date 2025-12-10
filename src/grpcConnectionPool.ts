import getEvonodeList from './getEvonodeList.js'
import { GrpcWebFetchTransport } from '@protobuf-ts/grpcweb-transport'
import { getRandomArrayItem } from './utils.js'
import { CoreClient } from '../proto/generated/core.client.js'
import { GetBlockchainStatusRequest, GetBlockchainStatusResponse_Status } from '../proto/generated/core.js'

const GRPC_DEFAULT_POOL_LIMIT = 5
export type MasternodeList = Record<string, MasternodeInfo>
export interface GRPCOptions {
  poolLimit: 5
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

const createClient = (url: string, abortController?: AbortController): CoreClient => {
  return new CoreClient(new GrpcWebFetchTransport({
    baseUrl: url,
    abort: abortController?.signal
  }))
}

export default class GRPCConnectionPool {
  dapiUrls: string[]
  network: string

  constructor (network: 'testnet' | 'mainnet', grpcOptions?: GRPCOptions) {
    const grpcPoolLimit = grpcOptions?.poolLimit ?? GRPC_DEFAULT_POOL_LIMIT

    this.network = network

    this._initialize(network, grpcPoolLimit, grpcOptions?.dapiUrl).catch(console.error)
  }

  async _initialize (network: 'testnet' | 'mainnet', poolLimit: number, dapiUrl?: string | string[]): Promise<void> {
    if (typeof dapiUrl === 'string') {
      this.dapiUrls = [dapiUrl]

      return
    }

    if (Array.isArray(dapiUrl)) {
      this.dapiUrls = dapiUrl

      return
    }

    if (dapiUrl != null) {
      throw new Error('Unrecognized DAPI URL')
    }

    // Add default seed nodes
    this.dapiUrls = seedNodes[network]

    // retrieve last evonodes list
    const evonodeList = await getEvonodeList(network)

    // map it to array of dapiUrls
    const networkDAPIUrls = Object.entries(evonodeList)
      .map(([, info]) => info)
      .filter((info: any) => info.status === 'ENABLED')
      .map((info: any) => {
        const [host] = info.address.split(':')

        return `https://${host as string}:${info.platformHTTPPort as number}`
      })

    // healthcheck nodes
    for (const url of networkDAPIUrls) {
      if (this.dapiUrls.length > poolLimit) {
        break
      }

      try {
        const client = createClient(url)

        const { response } = await client.getBlockchainStatus(GetBlockchainStatusRequest.fromJson({ v0: {} }))

        if (response.status === GetBlockchainStatusResponse_Status.READY) {
          this.dapiUrls.push(url)
        }
      } catch (e) {
      }
    }
  }

  getClient (abortController?: AbortController): CoreClient {
    const dapiUrl = getRandomArrayItem(this.dapiUrls)

    return createClient(dapiUrl, abortController)
  }
}
