import { DashCoreSDK } from '../dist/index.js'

const NETWORK = 'testnet'
const DAPI_URL = 'https://158.160.14.115:1443'

const ASSET_LOCK_TRANSACTION_HEX = 'REPLACE_WITH_ASSET_LOCK_TRANSACTION_HEX'
const INSTANT_LOCK_HEX = 'REPLACE_WITH_INSTANT_LOCK_HEX'
const CHAIN_LOCKED_HEIGHT = 0
const OUTPUT_INDEX = 0

const sdk = new DashCoreSDK({
  network: NETWORK,
  dapiUrl: DAPI_URL,
  poolLimit: 1
})

async function main () {
  if (ASSET_LOCK_TRANSACTION_HEX.startsWith('REPLACE_')) {
    throw new Error('Set ASSET_LOCK_TRANSACTION_HEX before running this example')
  }

  console.log('Asset lock proof inputs')
  console.log({
    network: NETWORK,
    dapiUrl: DAPI_URL,
    outputIndex: OUTPUT_INDEX
  })

  if (!INSTANT_LOCK_HEX.startsWith('REPLACE_')) {
    const instantProof = sdk.createInstantAssetLockProof(
      ASSET_LOCK_TRANSACTION_HEX,
      INSTANT_LOCK_HEX,
      OUTPUT_INDEX
    )

    console.log('Instant asset lock proof')
    console.log({
      type: instantProof.type,
      instantLock: Buffer.from(instantProof.instantLock).toString('hex'),
      transaction: Buffer.from(instantProof.transaction).toString('hex'),
      outputIndex: instantProof.outputIndex
    })
  }

  if (CHAIN_LOCKED_HEIGHT > 0) {
    const chainProof = sdk.createChainAssetLockProof(
      ASSET_LOCK_TRANSACTION_HEX,
      CHAIN_LOCKED_HEIGHT,
      OUTPUT_INDEX
    )

    console.log('Chain asset lock proof')
    console.log({
      type: chainProof.type,
      coreChainLockedHeight: chainProof.coreChainLockedHeight,
      outPoint: chainProof.outPoint.toJSON()
    })
  }

  if (INSTANT_LOCK_HEX.startsWith('REPLACE_') && CHAIN_LOCKED_HEIGHT <= 0) {
    console.log('No proof was created')
    console.log('Set INSTANT_LOCK_HEX or CHAIN_LOCKED_HEIGHT to build a proof')
  }
}

main().catch(console.error)
