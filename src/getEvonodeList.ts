import { MasternodeList } from './grpcConnectionPool.js'

const REQUEST_TIMEOUT = 8000
const RETRY_BACKOFF = 1500

/**
 * Query Platform Explorer for the list of active validators (DAPI nodes).
 *
 * The endpoint is flaky — it either answers fast or hangs until a connect
 * timeout — so a single request that fails makes GRPCConnectionPool fall back
 * to the lone seed node, which can lag the mempool and surface freshly
 * broadcast transactions as "not found". Retry a few times with a per-attempt
 * AbortController timeout and a small backoff to almost always fetch the full
 * node list.
 *
 * @param network - target Dash network
 * @param attempts - maximum number of attempts (optional, defaults to 4)
 */
export default async function getDAPINodeList (network: 'testnet' | 'mainnet', attempts = 4): Promise<MasternodeList> {
  const url = `https://${network === 'mainnet' ? '' : 'testnet.'}platform-explorer.pshenmic.dev/validators?isActive=true`

  let lastError: unknown

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)

      let resp: Response

      try {
        resp = await fetch(url, { signal: controller.signal })
      } finally {
        clearTimeout(timer)
      }

      if (resp.status !== 200) {
        throw new Error('Failed to query Platform Explorer for active validators')
      }

      const { resultSet } = await resp.json()

      return resultSet
      // eslint-disable-next-line
        .map((validator: any) => validator?.proTxInfo?.state?.service ? `https://${validator.proTxInfo.state.service.split(':')[0] as string}${network === 'mainnet' ? '' : ':1443'}` : undefined)
        .filter((e: any) => e != null)
    } catch (e) {
      lastError = e

      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_BACKOFF))
      }
    }
  }

  throw lastError
}
