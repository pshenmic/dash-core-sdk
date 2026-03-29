import { DashCoreSDK } from '../../dist/index.js'

const output = document.getElementById('output')
const networkSelect = document.getElementById('network')
const dapiUrlInput = document.getElementById('dapi-url')
const generateButton = document.getElementById('generate-address')
const checkStatusButton = document.getElementById('check-status')

const log = (label, value) => {
  const rendered = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  output.textContent = `${label}\n${rendered}`
}

const buildSdk = () => {
  return new DashCoreSDK({
    network: networkSelect.value,
    dapiUrl: dapiUrlInput.value.trim(),
    poolLimit: 1
  })
}

generateButton.addEventListener('click', async () => {
  generateButton.disabled = true
  log('Generating address...', '')

  try {
    const sdk = buildSdk()
    const keyPair = await sdk.generateAddress()
    log('Generated address', keyPair)
  } catch (error) {
    log('Address generation failed', {
      message: error instanceof Error ? error.message : String(error)
    })
  } finally {
    generateButton.disabled = false
  }
})

checkStatusButton.addEventListener('click', async () => {
  checkStatusButton.disabled = true
  log('Checking blockchain status...', '')

  try {
    const sdk = buildSdk()
    const status = await sdk.getBlockchainStatus()
    const height = await sdk.getBestBlockHeight()

    log('Blockchain smoke result', {
      dapiUrl: dapiUrlInput.value.trim(),
      network: networkSelect.value,
      status,
      bestBlockHeight: height.height
    })
  } catch (error) {
    log('Network smoke check failed', {
      dapiUrl: dapiUrlInput.value.trim(),
      network: networkSelect.value,
      message: error instanceof Error ? error.message : String(error),
      note: 'If this is a browser CORS or grpc-web issue, try another DAPI endpoint or test the same call from Node.'
    })
  } finally {
    checkStatusButton.disabled = false
  }
})
