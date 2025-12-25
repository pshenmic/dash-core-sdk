import {bytesToHex, hexToBytes} from "../../utils.js";
import {MnHfSignalJSON} from "../../types.js";

export class MnHfSignal {
  versionBit: number;
  quorumHash: string;
  sig: string;

  constructor(version: number, quorumHash: string, sig: string) {
    this.versionBit = version;
    this.quorumHash = quorumHash;
    this.sig = sig;
  }

  static fromBytes(bytes: Uint8Array): MnHfSignal {
    const dataView = new DataView(bytes.buffer)

    const version = dataView.getUint8(0)
    const quorumHash = bytes.slice(1, 33)
    const sig = bytes.slice(33)

    return new MnHfSignal(version, bytesToHex(quorumHash.toReversed()), bytesToHex(sig))
  }

  static fromHex(hex: string): MnHfSignal {
    return MnHfSignal.fromBytes(hexToBytes(hex))
  }

  bytes(): Uint8Array {
    const out = new Uint8Array(129)

    const versionByte = new Uint8Array(1)
    new DataView(versionByte.buffer).setUint8(0, this.versionBit)

    out.set(versionByte,0)
    out.set(hexToBytes(this.quorumHash).toReversed(), 1)
    out.set(hexToBytes(this.sig), 33)

    return out
  }

  hex(): string {
    return bytesToHex(this.bytes())
  }

  toJSON(): MnHfSignalJSON {
    return {
      versionBit: this.versionBit,
      quorumHash: this.quorumHash,
      sig: this.sig,
    }
  }
}