import { DashCoreSDK } from '../dist/index.js'

const NETWORK = 'testnet'
const DAPI_URL = 'https://158.160.14.115:1443'
const PAYMENT_AMOUNT_SATOSHIS = 1000
const PAYMENT_ADDRESS = 'ydAQ3M77cNCyyZkWXaZsWkUSoDpyPNC2mU'

const sdk = new DashCoreSDK({
  network: NETWORK,
  dapiUrl: DAPI_URL,
  poolLimit: 1
})

async function main () {
  const address = PAYMENT_ADDRESS ?? (await sdk.generateAddress()).address

  console.log('Waiting for payment')
  console.log({
    network: NETWORK,
    dapiUrl: DAPI_URL,
    address,
    amountSatoshis: PAYMENT_AMOUNT_SATOSHIS
  })

  if (PAYMENT_ADDRESS == null) {
    console.log('Send funds to the generated address above and keep this process running.')
  }

  const payment = await sdk.waitForPayment(address, PAYMENT_AMOUNT_SATOSHIS)

  console.log('Payment detected')
  console.log(payment)
}

main().catch(console.error)
