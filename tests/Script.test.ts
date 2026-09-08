import { Script } from '../src/types/Script.js'
import { Output } from '../src/types/Output.js'
import { bytesToHex, hexToBytes } from '../src/utils.js'

// Coinbase scriptSigs are not scripts - they are arbitrary miner data (BIP34
// height, pool tag, extranonce). These nine mainnet blocks carry AntPool data
// whose trailing bytes look like an OP_PUSHDATA4 with too few bytes left, which
// used to make Script.fromBytes read past the end of the script and throw
// `RangeError: Offset is outside the bounds of the DataView`, killing the parse
// of the whole block.
const COINBASE_SCRIPT_SIGS: Record<string, string> = {
  1491821: '036dc316284d696e656420627920416e74506f6f6c2039000b02200ac42ca2aa14345775d60c48b0441b44fe9bed6b00004e0a0000',
  1494186: '03aacc16284d696e656420627920416e74506f6f6c203900010020bbb0d69eb5279681deafb7a2d4f1cd5fe8aaf9530000db4e0000',
  1494436: '03a4cd16284d696e656420627920416e74506f6f6c203900010120a563667282b656404f0a56edceb9a6b6b24cec6a00004e0a0000',
  1499536: '0390e116284d696e656420627920416e74506f6f6c2039000b00206749ff8a74931a6fb73174cd8e1d0e8b9565033e00004e180000',
  2526552: '03588d26194d696e656420627920416e74506f6f6c209c000102e50a595f000071c74e1d1c00',
  2527358: '037e9026194d696e656420627920416e74506f6f6c209c000103d30adce100005b614e940000',
  2527517: '031d9126194d696e656420627920416e74506f6f6c209c0001016b1f5e6600005cc5d04e0000',
  2529281: '03019826194d696e656420627920416e74506f6f6c209c000100e72999ee0000c8004e280000',
  2529340: '033c9826194d696e656420627920416e74506f6f6c209c0001031d31ed93000098cda44e0500'
}

const P2PKH = '76a914a3890b802865e1cfeed7653d0fea33831d709b6f88ac'

describe('Script', () => {
  describe('#fromBytes truncated pushes', () => {
    it.each(Object.entries(COINBASE_SCRIPT_SIGS))(
      'should parse the mainnet block %s coinbase scriptSig without throwing',
      (_height, script) => {
        expect(Script.fromHex(script).hex()).toStrictEqual(script)
      }
    )

    it.each(['4c', '4d', '4e'])(
      'should keep a trailing OP_PUSHDATA (%s) with no length field as a bare opcode',
      (script) => {
        expect(Script.fromHex(script).hex()).toStrictEqual(script)
      }
    )

    it.each([
      ['OP_PUSHDATA1', '4c20deadbeef'],
      ['OP_PUSHDATA2', '4d2000deadbeef'],
      ['OP_PUSHDATA4', '4e20000000deadbeef'],
      ['OP_PUSHBYTES_32', '20deadbeef']
    ])('should not rewrite a %s whose data is truncated', (_name, script) => {
      expect(Script.fromHex(script).hex()).toStrictEqual(script)
    })

    it('should round-trip a well formed script unchanged', () => {
      expect(Script.fromHex(P2PKH).hex()).toStrictEqual(P2PKH)
      expect(Script.fromHex('4c04deadbeef').hex()).toStrictEqual('4c04deadbeef')
      expect(Script.fromHex('4c00').hex()).toStrictEqual('4c00')
    })
  })

  describe('#fromBytes on a view into a larger buffer', () => {
    it('should read pushed data relative to the view, not the backing buffer', () => {
      const backing = hexToBytes(`ffffffff${P2PKH}`)

      const script = Script.fromBytes(backing.subarray(4))

      expect(script.hex()).toStrictEqual(P2PKH)
      expect(script.getAddress('mainnet')).toStrictEqual('XqbY9a23LCRhE22uP3hgUtfn4HTdcQPmic')
    })

    it('should read an output script relative to the view, not the backing buffer', () => {
      const backing = hexToBytes(`deadbeef40420f000000000019${P2PKH}`)

      const output = Output.fromBytes(backing.subarray(4))

      expect(output.satoshis).toStrictEqual(1000000n)
      expect(bytesToHex(output.script.bytes())).toStrictEqual(P2PKH)
    })
  })
})
