import { DashCoreSDK } from '../dist/index.js'

const NETWORK = 'testnet'
const DAPI_URL = 'https://158.160.14.115:1443'
const BROADCAST_TRANSACTION = false

const CREDIT_OUTPUTS = [
  {
    address: 'ydAQ3M77cNCyyZkWXaZsWkUSoDpyPNC2mU',
    amountSatoshis: 1000
  }
]

const UTXOS = [
  {
    txid: 'cec8b01d233aa943911a82de4af138f5acd4f4ffdd86be5f0d33e3ba9a61952b',
    vout: 0,
    satoshis: 100_000_000,
    privateKeyWif: 'cSdCAjQMhnUsYHur2Dc3ybPC4wdmEuUSnsY9pJJvhZLLGRuaXotZ'
  }
]

const CHANGE_ADDRESS = 'yRLTdsMi7FNzqfT5S9QeLiY4suDaEHFLuK'

const sdk = new DashCoreSDK({
  network: NETWORK,
  dapiUrl: DAPI_URL,
  poolLimit: 1
})

async function main () {
  if (UTXOS.some(utxo => utxo.txid.startsWith('REPLACE_') || utxo.privateKeyWif.startsWith('REPLACE_'))) {
    throw new Error('Fill UTXOS with a real spendable testnet UTXO before running this example')
  }

  if (CHANGE_ADDRESS.startsWith('REPLACE_')) {
    throw new Error('Set CHANGE_ADDRESS before running this example')
  }

  const transaction = sdk.createAssetLockTransaction({
    utxos: UTXOS,
    creditOutputs: CREDIT_OUTPUTS,
    changeAddress: CHANGE_ADDRESS
  })

  console.log('Asset lock transaction created')
  console.log({
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
