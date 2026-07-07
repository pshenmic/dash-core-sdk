import { jest } from '@jest/globals'

// The @noble secp256k1 object is frozen, so `sign` cannot be spied in place.
// Mock the module instead, delegating everything to the real implementation
// except `sign`, which we drive to return DER encodings of a chosen length.
const actual = await import('@noble/curves/secp256k1.js')
const signMock = jest.fn<typeof actual.secp256k1.sign>()

jest.unstable_mockModule('@noble/curves/secp256k1.js', () => ({
  secp256k1: { ...actual.secp256k1, sign: signMock }
}))

const { Transaction } = await import('../src/types/Transaction.js')
const { Input } = await import('../src/types/Input.js')
const { Output } = await import('../src/types/Output.js')
const { Script } = await import('../src/types/Script.js')
const { PrivateKey } = await import('../src/types/PrivateKey.js')
const { Network, OPCODES } = await import('../src/constants.js')
const { hexToBytes } = await import('../src/utils.js')

describe('Transaction', () => {
  describe('#signInput signature size handling', () => {
    // A valid secp256k1 scalar so PublicKey derivation still works.
    const privateKey = PrivateKey.fromBytes(
      hexToBytes('0000000000000000000000000000000000000000000000000000000000000001'),
      Network.Testnet
    )

    const buildTransaction = (): InstanceType<typeof Transaction> => {
      const input = new Input(new Uint8Array(32), 0, new Script(), 0xffffffff)
      const output = new Output(1000n, new Script())

      return new Transaction([input], [output])
    }

    afterEach(() => {
      signMock.mockReset()
    })

    it('should accept a short variable-length DER signature (regression: 69-byte DER)', () => {
      // r or s losing its high 0x00 byte yields a DER encoding shorter than the
      // "typical" 71/72/73 bytes; this used to throw 'Invalid signature size'.
      signMock.mockReturnValue(new Uint8Array(69) as any)

      const transaction = buildTransaction()

      expect(() => transaction.sign(privateKey)).not.toThrow()

      const [sigChunk] = transaction.inputs[0].scriptSig.parsedScriptChunks

      // 69-byte DER + 1 sighash byte = 70 -> OP_PUSHBYTES_70
      expect(sigChunk.opcode).toBe(OPCODES.OP_PUSHBYTES_70)
    })

    it('should accept a maximum-length DER signature (72-byte DER)', () => {
      signMock.mockReturnValue(new Uint8Array(72) as any)

      const transaction = buildTransaction()

      transaction.sign(privateKey)

      const [sigChunk] = transaction.inputs[0].scriptSig.parsedScriptChunks

      // 72-byte DER + 1 sighash byte = 73 -> OP_PUSHBYTES_73 (BIP-66 cap)
      expect(sigChunk.opcode).toBe(OPCODES.OP_PUSHBYTES_73)
    })

    it('should reject an out-of-range signature size', () => {
      // 73-byte DER + sighash = 74 bytes, above the BIP-66 maximum.
      signMock.mockReturnValue(new Uint8Array(73) as any)

      const transaction = buildTransaction()

      expect(() => transaction.sign(privateKey)).toThrow('Invalid signature size')
    })
  })
})
