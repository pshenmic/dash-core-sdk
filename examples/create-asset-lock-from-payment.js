import { DashCoreSDK } from '../dist/index.js'

const NETWORK = 'testnet'
const DAPI_URL = 'https://158.160.14.115:1443'
const BROADCAST_TRANSACTION = false

const PAYMENT_TXID = 'REPLACE_WITH_PAYMENT_TXID'
const FUNDING_PRIVATE_KEY_WIF = 'REPLACE_WITH_IDENTITY_FUNDING_KEY_WIF'
const PAYMENT_OUTPUT_INDEX = undefined

const CREDIT_ADDRESS = undefined
const CHANGE_ADDRESS = undefined

const sdk = new DashCoreSDK({
  network: NETWORK,
  dapiUrl: DAPI_URL,
  poolLimit: 1
})

async function main () {
  if (PAYMENT_TXID.startsWith('REPLACE_')) {
    throw new Error('Set PAYMENT_TXID before running this example')
  }

  if (FUNDING_PRIVATE_KEY_WIF.startsWith('REPLACE_')) {
    throw new Error('Set FUNDING_PRIVATE_KEY_WIF before running this example')
  }

  const transaction = await sdk.createAssetLockTransactionFromPayment({
    txid: PAYMENT_TXID,
    fundingPrivateKeyWif: FUNDING_PRIVATE_KEY_WIF,
    outputIndex: PAYMENT_OUTPUT_INDEX,
    creditAddress: CREDIT_ADDRESS,
    changeAddress: CHANGE_ADDRESS
  })

  console.log('Asset lock transaction created from payment')
  console.log({
    paymentTxid: PAYMENT_TXID,
    txid: transaction.hash(),
    hex: transaction.hex(),
    json: transaction.toJSON()
  })

  if (BROADCAST_TRANSACTION) {
    console.log('Broadcast result')
    console.log(await sdk.broadcastTransaction(transaction.bytes()))
  }
}

main().catch(console.error)
