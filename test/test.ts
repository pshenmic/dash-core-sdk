import {DashCoreSDK} from '../src/DashCoreSDK.js'

const dashCoreSDK = new DashCoreSDK()

const {address} = await dashCoreSDK.generateAddress()

console.log(`accepting payment on address ${address}`)

const run = async () => {
  const payment = await dashCoreSDK.waitForPayment(address)

  console.log(payment)
}

run().catch(console.error)
