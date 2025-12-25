import {Output} from "../Output.js";
import {bytesToHex, hexToBytes} from "../../utils.js";
import {AssetLockTxJSON} from "../../types.js";

export class AssetLockTx {
  version: number
  count: number
  outputs: Output[]

  constructor(version: number, count: number, outputs: Output[]) {
    this.version = version
    this.count = count
    this.outputs = outputs
  }

  static fromBytes(bytes: Uint8Array): AssetLockTx {
    const dataView = new DataView(bytes.buffer)

    const version = dataView.getUint8(0)
    const count = dataView.getUint8(1)

    const outputs: Output[] = []
    let outputPadding = 2

    for (let i = 0; i < count; i++) {
      const output = Output.fromBytes(bytes.slice(outputPadding))

      outputs.push(output)
      outputPadding += output.bytes().byteLength
    }

    return new AssetLockTx(version, count, outputs)
  }

  static fromHex(hex: string): AssetLockTx {
    return AssetLockTx.fromBytes(hexToBytes(hex))
  }

  bytes(): Uint8Array {
    const versionByte = new Uint8Array(1)
    const countByte = new Uint8Array(1)

    new DataView(versionByte.buffer).setUint8(0, this.version)
    new DataView(countByte.buffer).setUint8(0, this.count)

    const outputsBytes = this.outputs.reduce((acc, curr) => {
      const outputBytes = curr.bytes()

      const out = new Uint8Array(outputBytes.byteLength + acc.byteLength)
      out.set(acc, 0)
      out.set(outputBytes, acc.byteLength)

      return out
    }, new Uint8Array(0))

    const out = new Uint8Array(2 + outputsBytes.byteLength)

    out.set(versionByte, 0)
    out.set(countByte, 1)
    out.set(outputsBytes, 2)

    return out
  }

  hex(): string {
    return bytesToHex(this.bytes())
  }

  toJSON(): AssetLockTxJSON {
    return {
      version: this.version,
      count: this.count,
      outputs: this.outputs.map(output => output.toJSON()),
    }
  }
}