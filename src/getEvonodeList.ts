import createCoreClient from './createCoreClient.js'
import { decode } from 'cbor2'
import { MasternodeListRequest } from '../proto/generated/core.js'

const REQUEST_TIMEOUT = 8000
const RETRY_BACKOFF = 1500

/**
 * DIP-3 masternode type carrying a Platform (evo) node.
 */
const MASTERNODE_TYPE_EVO = 1

interface MasternodeListEntry {
  nType?: number
  isValid?: boolean
  service?: string
  platformHTTPPort?: number
}

/**
 * Map a masternode list diff to the gRPC-web base URLs of its evonodes.
 *
 * DAPI serialises the diff as CBOR rather than protobuf, so it has to be
 * decoded before the evonode entries can be read.
 *
 * @param masternodeListDiff - CBOR encoded diff as DAPI returns it
 */
function toEvonodeUrls (masternodeListDiff: Uint8Array): string[] {
  const diff = decode<{ mnList?: MasternodeListEntry[] }>(masternodeListDiff)
  const mnList = diff?.mnList

  if (!Array.isArray(mnList)) {
    throw new Error('Masternode list diff from DAPI carries no mnList')
  }

  return mnList
    .filter((entry) =>
      entry.nType === MASTERNODE_TYPE_EVO &&
      entry.isValid === true &&
      entry.service != null &&
      entry.platformHTTPPort != null)
    .map((entry) => {
      const [host] = (entry.service as string).split(':')

      return `https://${host}:${entry.platformHTTPPort as number}`
    })
}

/**
 * Read the evonode list from a single DAPI node.
 *
 * Only the first stream message is needed: a fresh subscription opens with a
 * diff against the null block hash, which is the complete list, and everything
 * after it is incremental.
 *
 * @param url - DAPI node to query
 */
async function queryNode (url: string): Promise<string[]> {
  const abortController = new AbortController()
  const timer = setTimeout(() => abortController.abort(), REQUEST_TIMEOUT)

  try {
    const client = createCoreClient(url, abortController)
    const stream = client.subscribeToMasternodeList(MasternodeListRequest.create({}))

    const { value, done } = await stream.responses[Symbol.asyncIterator]().next()

    if (done === true || value == null) {
      throw new Error('DAPI closed the masternode list stream without sending a diff')
    }

    return toEvonodeUrls(value.masternodeListDiff)
  } finally {
    clearTimeout(timer)
    // Stop the stream: only its first message is of interest
    abortController.abort()
  }
}

/**
 * Query DAPI for the list of active evonodes, as gRPC-web base URLs.
 *
 * The list comes from DAPI's own masternode list stream rather than a
 * third-party index, so it is served by the same nodes the pool already talks
 * to. Attempts rotate over the supplied nodes, since a node that is unhealthy
 * or lagging tends to stay that way for the whole retry window. If every
 * attempt fails the last error is what reaches the caller.
 *
 * @param dapiUrls - nodes to query, tried in rotation
 * @param attempts - maximum number of attempts (optional, defaults to 5)
 */
export default async function getEvonodeList (dapiUrls: string[], attempts = 5): Promise<string[]> {
  if (dapiUrls.length === 0) {
    throw new Error('No DAPI nodes available to query the masternode list')
  }

  let lastError: unknown

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await queryNode(dapiUrls[attempt % dapiUrls.length])
    } catch (e) {
      lastError = e

      if (attempt < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_BACKOFF))
      }
    }
  }

  throw lastError
}
