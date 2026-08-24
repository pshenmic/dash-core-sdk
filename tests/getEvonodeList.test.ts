import { jest } from '@jest/globals'

const subscribeToMasternodeList = jest.fn<(request: unknown) => { responses: AsyncIterable<{ masternodeListDiff: Uint8Array }> }>()
const createCoreClient = jest.fn<(url: string, abortController?: AbortController) => unknown>()

jest.unstable_mockModule('../src/createCoreClient.js', () => ({
  default: createCoreClient
}))

const { default: getEvonodeList } = await import('../src/getEvonodeList.js')
const { default: decodeCBOR } = await import('../src/decodeCBOR.js')

/**
 * Encode the subset of CBOR the tests need, so fixtures stay readable.
 */
function encodeCBOR (value: unknown): Uint8Array {
  const out: number[] = []

  const head = (major: number, argument: number): void => {
    if (argument < 24) {
      out.push((major << 5) | argument)
    } else if (argument < 256) {
      out.push((major << 5) | 24, argument)
    } else {
      out.push((major << 5) | 25, argument >> 8, argument & 0xff)
    }
  }

  const write = (v: unknown): void => {
    if (typeof v === 'number') {
      head(0, v)
    } else if (typeof v === 'boolean') {
      out.push(v ? 0xf5 : 0xf4)
    } else if (typeof v === 'string') {
      const encoded = new TextEncoder().encode(v)
      head(3, encoded.length)
      out.push(...encoded)
    } else if (Array.isArray(v)) {
      head(4, v.length)
      v.forEach(write)
    } else if (v != null) {
      const entries = Object.entries(v as Record<string, unknown>)
      head(5, entries.length)
      entries.forEach(([k, item]) => { write(k); write(item) })
    }
  }

  write(value)

  return new Uint8Array(out)
}

const streamOf = (diff: Uint8Array): { responses: AsyncIterable<{ masternodeListDiff: Uint8Array }> } => ({
  responses: {
    [Symbol.asyncIterator]: async function * () {
      yield { masternodeListDiff: diff }
    }
  }
})

const emptyStream = (): { responses: AsyncIterable<{ masternodeListDiff: Uint8Array }> } => ({
  responses: {
    [Symbol.asyncIterator]: async function * () {}
  }
})

const NODES = ['https://node-a:1443', 'https://node-b:1443']

describe('getEvonodeList', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    subscribeToMasternodeList.mockReset()
    createCoreClient.mockReset()
    createCoreClient.mockImplementation(() => ({ subscribeToMasternodeList }))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  /**
   * Drive the retry backoff without waiting for it in real time.
   */
  const runWithTimers = async <T>(promise: Promise<T>): Promise<T> => {
    const settled = promise.then((v) => ({ ok: true, v }), (e) => ({ ok: false, e }))

    for (let i = 0; i < 50; i++) {
      // The stream is consumed through an async iterator, so several microtask
      // turns pass before the next backoff timer is even scheduled
      for (let tick = 0; tick < 10; tick++) {
        await Promise.resolve()
      }

      jest.runOnlyPendingTimers()
    }

    const result = await settled as any

    if (result.ok !== true) {
      throw result.e
    }

    return result.v
  }

  it('should round-trip a fixture through the real decoder', () => {
    const diff = encodeCBOR({ mnList: [{ nType: 1, isValid: true }] })

    expect(decodeCBOR(diff)).toEqual({ mnList: [{ nType: 1, isValid: true }] })
  })

  it('should map evonodes to gRPC-web base URLs', async () => {
    subscribeToMasternodeList.mockReturnValue(streamOf(encodeCBOR({
      mnList: [
        { nType: 1, isValid: true, service: '68.67.122.23:19999', platformHTTPPort: 1443 },
        { nType: 1, isValid: true, service: '1.2.3.4:9999', platformHTTPPort: 443 }
      ]
    })))

    await expect(runWithTimers(getEvonodeList(NODES))).resolves.toEqual([
      'https://68.67.122.23:1443',
      'https://1.2.3.4:443'
    ])
  })

  it('should skip regular masternodes, invalid entries and entries without a platform port', async () => {
    subscribeToMasternodeList.mockReturnValue(streamOf(encodeCBOR({
      mnList: [
        { nType: 0, isValid: true, service: '1.1.1.1:19999', platformHTTPPort: 1443 },
        { nType: 1, isValid: false, service: '2.2.2.2:19999', platformHTTPPort: 1443 },
        { nType: 1, isValid: true, service: '3.3.3.3:19999' },
        { nType: 1, isValid: true, service: '4.4.4.4:19999', platformHTTPPort: 1443 }
      ]
    })))

    await expect(runWithTimers(getEvonodeList(NODES))).resolves.toEqual(['https://4.4.4.4:1443'])
  })

  it('should rotate over the supplied nodes across attempts', async () => {
    subscribeToMasternodeList
      .mockImplementationOnce(() => { throw new Error('node a down') })
      .mockReturnValueOnce(streamOf(encodeCBOR({ mnList: [] })))

    await expect(runWithTimers(getEvonodeList(NODES))).resolves.toEqual([])

    expect(createCoreClient.mock.calls.map(([url]) => url)).toEqual(NODES)
  })

  it('should make five attempts before giving up', async () => {
    subscribeToMasternodeList.mockImplementation(() => { throw new Error('every node is down') })

    await expect(runWithTimers(getEvonodeList(NODES))).rejects.toThrow('every node is down')
    expect(subscribeToMasternodeList).toHaveBeenCalledTimes(5)
  })

  it('should surface the last error, not the first', async () => {
    subscribeToMasternodeList
      .mockImplementationOnce(() => { throw new Error('first failure') })
      .mockImplementationOnce(() => { throw new Error('second failure') })
      .mockImplementationOnce(() => { throw new Error('third failure') })
      .mockImplementationOnce(() => { throw new Error('fourth failure') })
      .mockImplementationOnce(() => { throw new Error('last failure') })

    await expect(runWithTimers(getEvonodeList(NODES))).rejects.toThrow('last failure')
  })

  it('should fail when the stream closes without a diff', async () => {
    subscribeToMasternodeList.mockReturnValue(emptyStream())

    await expect(runWithTimers(getEvonodeList(NODES)))
      .rejects.toThrow('DAPI closed the masternode list stream without sending a diff')
  })

  it('should fail when the diff carries no mnList', async () => {
    subscribeToMasternodeList.mockReturnValue(streamOf(encodeCBOR({ blockHash: 'deadbeef' })))

    await expect(runWithTimers(getEvonodeList(NODES)))
      .rejects.toThrow('Masternode list diff from DAPI carries no mnList')
  })

  it('should refuse to query with no nodes available', async () => {
    await expect(getEvonodeList([])).rejects.toThrow('No DAPI nodes available to query the masternode list')
  })
})
