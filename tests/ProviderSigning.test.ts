import { describe, expect, test } from '@jest/globals'
import { Transaction } from '../src/types/Transaction.js'
import { ProRegTX } from '../src/types/ExtraPayload/ProRegTX.js'
import { ProUpRegTx } from '../src/types/ExtraPayload/ProUpRegTx.js'
import { ProUpServTx } from '../src/types/ExtraPayload/ProUpServTx.js'
import { ProUpRevTx } from '../src/types/ExtraPayload/ProUpRevTx.js'
import { PrivateKey } from '../src/types/PrivateKey.js'
import { Script } from '../src/types/Script.js'
import { Network } from '../src/constants.js'
import { recoverHashSigner } from '../src/signing.js'
import { blsPublicKey, blsVerify } from '../src/bls.js'
import { bytesToHex, doubleSHA256, hexToBytes } from '../src/utils.js'

const reversedHex = (bytes: Uint8Array): string => bytesToHex(bytes.toReversed())
const b64 = (hex: string): string => Buffer.from(hexToBytes(hex)).toString('base64')

// rust-dashcore special_transaction tests, Dash Core testnet transactions
const PRO_REG_TX = '0300010001ca9a43051750da7c5f858008f2ff7732d15691e48eb7f845c791e5dca78bab58010000006b483045022100fe8fec0b3880bcac29614348887769b0b589908e3f5ec55a6cf478a6652e736502202f30430806a6690524e4dd599ba498e5ff100dea6a872ebb89c2fd651caa71ed012103d85b25d6886f0b3b8ce1eef63b720b518fad0b8e103eba4e85b6980bfdda2dfdffffffff018e37807e090000001976a9144ee1d4e5d61ac40a13b357ac6e368997079678c888ac00000000fd1201010000000000ca9a43051750da7c5f858008f2ff7732d15691e48eb7f845c791e5dca78bab580000000000000000000000000000ffff010205064e1f3dd03f9ec192b5f275a433bfc90f468ee1a3eb4c157b10706659e25eb362b5d902d809f9160b1688e201ee6e94b40f9b5062d7074683ef05a2d5efb7793c47059c878dfad38a30fafe61575db40f05ab0a08d55119b0aad300001976a9144fbc8fb6e11e253d77e5a9c987418e89cf4a63d288ac3477990b757387cb0406168c2720acf55f83603736a314a37d01b135b873a27b411fb37e49c1ff2b8057713939a5513e6e711a71cff2e517e6224df724ed750aef1b7f9ad9ec612b4a7250232e1e400da718a9501e1d9a5565526e4b1ff68c028763'
const PRO_UP_REG_TX = '0300030001c7de76dac8dd96f9b49b12a06fe39c8caf0cad12d23ad6026094d9b11b2b260d000000006b483045022100b31895e8cea95a965c82d842eadd6eef3c7b29e677c62a5c8e2b5dce05b4ddfc02206c7b5a9ea8b71983c3b21f4ff75ac1aa44090d28af8b2d9b93e794e6eb5835e20121032ea8be689184f329dce575776bc956cd52230f4c04755d5753d9491ea5bf8f2affffffff01c94670d0060000001976a914345f07bc7ebaf9f82f273be249b6066d2d5c236688ac00000000e4010049aa692330179f95c1342715102e37777df91cc0f3a4ae7e8f9e214ee97dbb3d0000139b654f0b1c031e1cf2b934c2d895178875cfe7c6a4f6758f02bc66eea7fc292d0040701acbe31f5e14a911cb061a2f6cc4a7bb877a80c11ae06b988d98305773f93b981976a91456bcf3cac49235537d6ce0fb3214d8850a6db77788ac2d7f857a2f15eb9340a0cfbce3ff8cf09b40e582d05b1f98c7468caa0f942bcf411ff69c9cb072660cc10048332c14c08621e7461f1f4f54b448baedc0e3434d9a7c3a1780885aaef4dd44c597b49b97595e02ad54728f572967d3ce0c2c0ceac174'
const PRO_UP_SERV_TX = '03000200018f3fe6683e36326669b6e34876fb2a2264e8327e822f6fec304b66f47d61b3e1010000006b48304502210082af6727408f0f2ec16c7da1c42ccf0a026abea6a3a422776272b03c8f4e262a022033b406e556f6de980b2d728e6812b3ae18ee1c863ae573ece1cbdf777ca3e56101210351036c1192eaf763cd8345b44137482ad24b12003f23e9022ce46752edf47e6effffffff0180220e43000000001976a914123cbc06289e768ca7d743c8174b1e6eeb610f1488ac00000000b501003a72099db84b1c1158568eec863bea1b64f90eccee3304209cebe1df5e7539fd00000000000000000000ffff342440944e1f00e6725f799ea20480f06fb105ebe27e7c4845ab84155e4c2adf2d6e5b73a998b1174f9621bbeda5009c5a6487bdf75edcf602b67fe0da15c275cc91777cb25f5fd4bb94e84fd42cb2bb547c83792e57c80d196acd47020e4054895a0640b7861b3729c41dd681d4996090d5750f65c4b649a5cd5b2bdf55c880459821e53d91c9'

const BLS_SECRET = hexToBytes('0d'.repeat(32))

describe('ProRegTX signing', () => {
  const collateralKey = PrivateKey.fromWIF('cTVm7EkgzNBPcwAKGYHfvyK8cyrRAC8n3SUUw8qjLqCg2rpcczfo')
  const signString = 'yTb47qEBpNmgXvYYsHEN4nh8yJwa5iC4Cs|0|yRxHYGLf9G4UVYdtAoB2iAzR3sxxVaZB6y|yfbxyP4ctRJR1rs3A8C3PdXA4Wtcrw7zTi|71e973f79003accd202b9a2ab2613ac6ced601b26684e82f561f6684fef2f102'

  test('should hash the payload without payloadSig', () => {
    const payload = Transaction.fromHex(PRO_REG_TX).extraPayload as ProRegTX
    payload.payloadSig = ''

    expect(reversedHex(payload.payloadHash())).toBe('71e973f79003accd202b9a2ab2613ac6ced601b26684e82f561f6684fef2f102')
  })

  test('should build the collateral sign string', () => {
    expect((Transaction.fromHex(PRO_REG_TX).extraPayload as ProRegTX).signString(Network.Testnet)).toBe(signString)
  })

  test('should compute and set the inputs hash', () => {
    const tx = Transaction.fromHex(PRO_REG_TX)
    const payload = tx.extraPayload as ProRegTX
    payload.inputsHash = '00'.repeat(32)

    expect(tx.providerInputsHash()).toBe('7ba273b835b1017da314a3363760835ff5ac20278c160604cb8773750b997734')
    expect(payload.inputsHash).toBe('7ba273b835b1017da314a3363760835ff5ac20278c160604cb8773750b997734')
  })

  test('should reproduce the collateral signature and the transaction', () => {
    const tx = Transaction.fromHex(PRO_REG_TX)
    const payload = tx.extraPayload as ProRegTX
    payload.payloadSig = ''

    payload.signWithCollateralKey(collateralKey, Network.Testnet)

    expect(b64(payload.payloadSig)).toBe('H7N+ScH/K4BXcTk5pVE+bnEacc/y5RfmIk33JO11Cu8bf5rZ7GErSnJQIy4eQA2nGKlQHh2aVWVSbksf9owCh2M=')
    expect(tx.hex()).toBe(PRO_REG_TX)
  })

  test('should size an external collateral payload with its signature', () => {
    const tx = Transaction.fromHex(PRO_REG_TX)
    const payload = tx.extraPayload as ProRegTX
    const signedPayloadSize = payload.bytes().byteLength

    expect(payload.hasExternalCollateral()).toBe(true)

    payload.payloadSig = ''
    expect(payload.signedSize()).toBe(signedPayloadSize)
    expect(tx.signedSize()).toBe(PRO_REG_TX.length / 2)

    // the recorded input carries a 72 byte signature, the estimate allows the 73 byte maximum
    tx.inputs[0].scriptSig = new Script()
    expect(tx.signedSize()).toBe(PRO_REG_TX.length / 2 + 1)
  })

  test('should size an internal collateral payload without a signature', () => {
    const payload = (Transaction.fromHex(PRO_REG_TX).extraPayload as ProRegTX)
    payload.collateralOutpoint.txId = '00'.repeat(32)
    payload.payloadSig = ''

    expect(payload.hasExternalCollateral()).toBe(false)
    expect(payload.signedSize()).toBe(payload.bytes().byteLength)
  })
})

describe('ProUpRegTx signing', () => {
  test('should hash the payload without payloadSig and set the inputs hash', () => {
    const tx = Transaction.fromHex(PRO_UP_REG_TX)
    const payload = tx.extraPayload as ProUpRegTx

    expect(reversedHex(payload.payloadHash())).toBe('85deffc85d2304f0305356e1dc8d02eecdb3220576abb370bc67be446c854296')
    expect(tx.providerInputsHash()).toBe('cf2b940faa8c46c7981f5bd082e5409bf08cffe3bccfa04093eb152f7a857f2d')
  })

  test('should sign the payload hash with the owner key', () => {
    const tx = Transaction.fromHex(PRO_UP_REG_TX)
    const payload = tx.extraPayload as ProUpRegTx
    const ownerKey = PrivateKey.fromBytes(hexToBytes('22'.repeat(32)), Network.Testnet)

    payload.payloadSig = ''
    const signedSize = payload.signedSize()
    payload.signWithOwnerKey(ownerKey)

    expect(recoverHashSigner(payload.payloadHash(), hexToBytes(payload.payloadSig)).getAddress(Network.Testnet)).toBe(ownerKey.getAddress())
    expect(payload.bytes().byteLength).toBe(signedSize)
    expect(ProUpRegTx.fromBytes(payload.bytes()).payloadSig).toBe(payload.payloadSig)
  })
})

describe('ProUpServTx signing', () => {
  test('should hash the payload without the signature and set the inputs hash', () => {
    const tx = Transaction.fromHex(PRO_UP_SERV_TX)
    const payload = tx.extraPayload as ProUpServTx

    expect(reversedHex(payload.payloadHash())).toBe('9784b3663039784858420677b00f0b3f34af8ff1f1788adfd0e681d345b776ba')
    expect(tx.providerInputsHash()).toBe('b198a9735b6e2ddf2a4c5e1584ab45487c7ee2eb05b16ff08004a29e795f72e6')
  })

  test('should refuse the legacy BLS scheme of version 1', () => {
    const payload = Transaction.fromHex(PRO_UP_SERV_TX).extraPayload as ProUpServTx

    expect(() => payload.signWithOperatorKey(BLS_SECRET)).toThrow('legacy BLS')
  })

  test('should sign the payload hash with the operator key', () => {
    const payload = Transaction.fromHex(PRO_UP_SERV_TX).extraPayload as ProUpServTx
    payload.version = 2
    payload.payloadSig = ''

    const signedSize = payload.signedSize()
    payload.signWithOperatorKey(BLS_SECRET)

    expect(payload.bytes().byteLength).toBe(signedSize)
    expect(blsVerify(hexToBytes(payload.payloadSig), payload.payloadHash(), blsPublicKey(BLS_SECRET))).toBe(true)
    expect(ProUpServTx.fromBytes(payload.bytes()).payloadSig).toBe(payload.payloadSig)
  })
})

describe('ProUpRevTx', () => {
  const unsigned = new ProUpRevTx(2, 'ab'.repeat(32), 1, 'cd'.repeat(32), '')

  test('should not write a missing signature as zero bytes', () => {
    expect(unsigned.bytes().byteLength).toBe(68)
    expect(ProUpRevTx.fromBytes(unsigned.bytes()).payloadSig).toBe('')
  })

  test('should sign the payload hash with the operator key', () => {
    const payload = ProUpRevTx.fromBytes(unsigned.bytes())
    const signedSize = payload.signedSize()

    payload.signWithOperatorKey(BLS_SECRET)
    const bytes = payload.bytes()

    expect(bytes.byteLength).toBe(signedSize)
    expect(payload.payloadHash()).toEqual(doubleSHA256(bytes.slice(0, 68)))
    expect(blsVerify(bytes.slice(68), payload.payloadHash(), blsPublicKey(BLS_SECRET))).toBe(true)
    expect(ProUpRevTx.fromBytes(bytes).hex()).toBe(payload.hex())
  })

  test('should refuse the legacy BLS scheme of version 1', () => {
    expect(() => new ProUpRevTx(1, 'ab'.repeat(32), 1, 'cd'.repeat(32), '').signWithOperatorKey(BLS_SECRET)).toThrow('legacy BLS')
  })

  test('should set the inputs hash of a revocation', () => {
    const tx = Transaction.fromHex(PRO_UP_SERV_TX)
    tx.type = 4
    tx.extraPayload = ProUpRevTx.fromBytes(unsigned.bytes())

    expect(tx.providerInputsHash()).toBe('b198a9735b6e2ddf2a4c5e1584ab45487c7ee2eb05b16ff08004a29e795f72e6')
    expect((tx.extraPayload).inputsHash).toBe('b198a9735b6e2ddf2a4c5e1584ab45487c7ee2eb05b16ff08004a29e795f72e6')
  })
})
