import {bytesToHex, hexToBytes} from "../../utils.js";
import {QfCommit} from "../Messages/QfCommit.js";
import {QcTxJSON} from "../../types.js";

export class QcTx {
  version: number;
  height: number
  commitment: QfCommit

  constructor(version: number, height: number, commitment: QfCommit) {
    this.version = version;
    this.height = height;
    this.commitment = commitment;
  }

  static fromBytes(bytes: Uint8Array): QcTx {
    const dataView = new DataView(bytes.buffer)

    const version = dataView.getUint16(0, true)
    const height = dataView.getUint32(2, true)

    const commitment = QfCommit.fromBytes(bytes.slice(6))

    return new QcTx(version, height, commitment)
  }

  static fromHex(hex: string): QcTx {
    return QcTx.fromBytes(hexToBytes(hex))
  }

  bytes(): Uint8Array{
    const versionBytes = new Uint8Array(2);
    const heightBytes = new Uint8Array(4);

    new DataView(versionBytes.buffer).setUint16(0, this.version, true);
    new DataView(heightBytes.buffer).setUint32(0, this.height, true);

    const commitmentBytes = this.commitment.bytes();

    const out = new Uint8Array(6+commitmentBytes.byteLength);

    out.set(versionBytes, 0)
    out.set(heightBytes, 2)
    out.set(commitmentBytes, 6)

    return out
  }

  hex(): string {
    return bytesToHex(this.bytes())
  }

  toJSON(): QcTxJSON {
    return {
      version: this.version,
      height: this.height,
      commitment: this.commitment.toJSON(),
    }
  }
}