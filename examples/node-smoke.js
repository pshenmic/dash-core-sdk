import { DashCoreSDK } from '../dist/index.js'

// ===== CONFIG =====
const NETWORK = 'testnet' // 'testnet' | 'mainnet'
const DAPI_URL = 'https://158.160.14.115:1443' // e.g. 'https://your-node:443'

// optional
const TXID = undefined // '...'
const RAW_TX_HEX = undefined // '...'
const PAYMENT_ADDRESS = undefined // '...'
const BLOCK_HASH = undefined // optional

const STREAM_RUNTIME_MS = 5000
// ==================

const sdk = new DashCoreSDK({
  network: NETWORK,
  dapiUrl: DAPI_URL,
  poolLimit: 1
})

async function main() {
  console.log('--- generateAddress ---')
  const addr = await sdk.generateAddress()
  console.log(addr)

  console.log('--- getBlockchainStatus ---')
  console.log(await sdk.getBlockchainStatus())

  console.log('--- getMasternodeStatus ---')
  console.log(await sdk.getMasternodeStatus())

  console.log('--- getBestBlockHeight ---')
  const best = await sdk.getBestBlockHeight()
  console.log(best)

  console.log('--- getEstimatedTransactionFee ---')
  try {
    console.log(await sdk.getEstimatedTransactionFee(6))
  } catch (error) {
    console.log('getEstimatedTransactionFee is unavailable on this DAPI endpoint')
    console.log(error)
  }

  console.log('--- getBlock (by height) ---')
  const blockByHeight = await sdk.getBlock({ height: best.height })
  console.log(blockByHeight)

  if (BLOCK_HASH) {
    console.log('--- getBlock (by hash) ---')
    console.log(await sdk.getBlock({ hash: BLOCK_HASH }))
  }

  if (TXID) {
    console.log('--- getTransaction ---')
    console.log(await sdk.getTransaction(TXID))
  }

  if (RAW_TX_HEX) {
    console.log('--- broadcastTransaction ---')
    const raw = Buffer.from(RAW_TX_HEX, 'hex')
    console.log(await sdk.broadcastTransaction(raw))
  }

  console.log('--- subscribeToTransactions (short run) ---')
  const sub = sdk.subscribeToTransactions([addr.address])

  const start = Date.now()
  for await (const event of sub) {
    console.log('event:', event)

    if (Date.now() - start > STREAM_RUNTIME_MS) break
  }

  console.log('--- subscribeToTransactionsWithProofs (short run) ---')
  const bf = { vData: [], nHashFuncs: 0, nTweak: 0, nFlags: 0 }

  const stream = sdk.subscribeToTransactionsWithProofs(
    bf,
    0,
    false,
    undefined,
    best.height
  )

  const iterator = stream.responses[Symbol.asyncIterator]()
  const timeout = Date.now() + STREAM_RUNTIME_MS

  while (Date.now() < timeout) {
    const { value, done } = await iterator.next()
    if (done) break
    console.log(value)
  }

  console.log('--- subscribeToMasternodeList (short run) ---')
  const mnStream = sdk.subscribeToMasternodeList()
  const mnIter = mnStream.responses[Symbol.asyncIterator]()
  const mnTimeout = Date.now() + STREAM_RUNTIME_MS

  while (Date.now() < mnTimeout) {
    const { value, done } = await mnIter.next()
    if (done) break
    console.log(value)
  }

  console.log('--- subscribeToBlockHeadersWithChainLocks ---')
  try {
    sdk.subscribeToBlockHeadersWithChainLocks()
  } catch (e) {
    console.log('Expected error:', e.message)
  }

  if (PAYMENT_ADDRESS) {
    console.log('--- waitForPayment ---')
    console.log(await sdk.waitForPayment(PAYMENT_ADDRESS))
  }

  console.log('DONE')
}

main().catch(console.error)
