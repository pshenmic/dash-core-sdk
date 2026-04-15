import { DashCoreSDK } from '../../dist/browser.js'

const output = document.getElementById('output')
const networkSelect = document.getElementById('network')
const dapiUrlInput = document.getElementById('dapi-url')
const paymentAddressInput = document.getElementById('payment-address')
const paymentAmountInput = document.getElementById('payment-amount')
const generateButton = document.getElementById('generate-address')
const checkStatusButton = document.getElementById('check-status')
const waitForPaymentButton = document.getElementById('wait-for-payment')

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

const getPaymentAmount = () => {
  const amount = BigInt(paymentAmountInput.value.trim())

  if (amount < 0n) {
    throw new Error('Amount must be a non-negative integer in satoshis')
  }

  return amount
}

generateButton.addEventListener('click', async () => {
  generateButton.disabled = true
  log('Generating address...', '')

  try {
    const sdk = buildSdk()
    const keyPair = await sdk.generateAddress()
    paymentAddressInput.value = keyPair.address
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

waitForPaymentButton.addEventListener('click', async () => {
  waitForPaymentButton.disabled = true

  try {
    const address = paymentAddressInput.value.trim()
    const amountSatoshis = getPaymentAmount()

    if (address.length === 0) {
      throw new Error('Address is required')
    }

    const sdk = buildSdk()

    log('Waiting for payment...', {
      dapiUrl: dapiUrlInput.value.trim(),
      network: networkSelect.value,
      address,
      amountSatoshis,
      note: 'waitForIncomingTransaction listens only for new payment events after start'
    })

    const payment = await sdk.waitForIncomingTransaction(address, amountSatoshis)

    log('Payment detected', payment)
  } catch (error) {
    log('waitForIncomingTransaction failed', {
      dapiUrl: dapiUrlInput.value.trim(),
      network: networkSelect.value,
      address: paymentAddressInput.value.trim(),
      amountSatoshis: paymentAmountInput.value.trim(),
      message: error instanceof Error ? error.message : String(error)
    })
  } finally {
    waitForPaymentButton.disabled = false
  }
})
