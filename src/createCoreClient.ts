import { GrpcWebFetchTransport } from '@protobuf-ts/grpcweb-transport'
import { CoreClient } from '../proto/generated/core.client.js'

/**
 * Build a DAPI Core gRPC-web client bound to a single node.
 *
 * Lives in its own module so both the connection pool and the evonode lookup
 * can use it without importing each other.
 *
 * @param url - DAPI node base URL
 * @param abortController - optional controller cancelling the client's calls
 */
export default function createCoreClient (url: string, abortController?: AbortController): CoreClient {
  return new CoreClient(new GrpcWebFetchTransport({
    baseUrl: url,
    abort: abortController?.signal
  }))
}
