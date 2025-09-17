import {Channel, Client, createChannel, createClient} from 'nice-grpc-web'
import {
    CoreDefinition,
    GetBlockchainStatusRequest,
    GetBlockchainStatusResponse,
    GetBlockchainStatusResponse_Status
} from '../proto/generated/core.js'
import getRandomArrayItem from "./utils.js";
import getEvonodeList from './getEvonodeList.js';
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

export default class GRPCConnectionPool {
    channels: Channel[]
    network: string

    constructor (network: 'testnet' | 'mainnet', grpcOptions?: GRPCOptions) {
        const grpcPoolLimit = grpcOptions?.poolLimit ?? GRPC_DEFAULT_POOL_LIMIT

        this.network = network

        this._initialize(network, grpcPoolLimit, grpcOptions?.dapiUrl).catch(console.error)
    }

    async _initialize (network: 'testnet' | 'mainnet', poolLimit: number, dapiUrl?: string | string[]): Promise<void> {
        if (typeof dapiUrl === 'string') {
            this.channels = [createChannel(dapiUrl)]

            return
        }

        if (Array.isArray(dapiUrl)) {
            this.channels = dapiUrl.map(dapiUrl => createChannel(dapiUrl))

            return
        }

        if (dapiUrl != null) {
            throw new Error('Unrecognized DAPI URL')
        }

        // Add default seed nodes
        this.channels = (seedNodes[network].map((dapiUrl: string) => createChannel(dapiUrl)))

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
            if (this.channels.length > poolLimit) {
                break
            }

            try {
                const channel = createChannel(url)
                const client = createClient(CoreDefinition, channel)
                const response: GetBlockchainStatusResponse = await client.getBlockchainStatus(GetBlockchainStatusRequest.fromPartial({ v0: {} }))

                if (response.status === GetBlockchainStatusResponse_Status.READY) {
                    this.channels.push(createChannel(url))
                }
            } catch (e) {
            }
        }
    }

    getClient (): Client<CoreDefinition> {
        const channel = getRandomArrayItem(this.channels)
        return createClient(CoreDefinition, channel)
    }
}
