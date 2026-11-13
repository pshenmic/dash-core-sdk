import { GrpcWebFetchTransport } from '@protobuf-ts/grpcweb-transport'
import { CoreClient } from '../proto/generated/core.client.js'
import { fetchWithDetails } from './fetchWithDetails.js'

/**
 * Build a DAPI Core gRPC-web client bound to a single node.
 *
 * Lives in its own module so both the connection pool and the evonode lookup
 * can use it without importing each other.
 *
 * @param url - DAPI node base URL
 * @param abortController - optional controller cancelling the client's calls
 * @param fetch - fetch implementation used by the transport
 */
export default function createCoreClient (url: string, abortController?: AbortController, fetch: typeof globalThis.fetch = fetchWithDetails): CoreClient {
  return new CoreClient(new GrpcWebFetchTransport({
    baseUrl: url,
    abort: abortController?.signal,
    fetch
  }))
}
