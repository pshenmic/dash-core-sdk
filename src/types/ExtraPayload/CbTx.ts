import { bytesToHex, decodeCompactSize, encodeCompactSize, getCompactVariableSize, hexToBytes } from '../../utils.js'
import { CbTxJSON } from '../../types.js'

export class CbTx {
  version: number
  height: number
  merkleRootMNList: string
  merkleRootQuorums?: string
  bestCLHeightDiff?: bigint
  bestCLSignature?: string
  creditPoolBalance?: bigint

  constructor (version: number, height: number, merkleRootMNList: string, merkleRootQuorums?: string, bestCLHeightDiff?: bigint, bestCLSignature?: string, creditPoolBalance?: bigint) {
    this.version = version
    this.height = height
    this.merkleRootMNList = merkleRootMNList
    this.merkleRootQuorums = merkleRootQuorums
    this.bestCLHeightDiff = bestCLHeightDiff
    this.bestCLSignature = bestCLSignature
    this.creditPoolBalance = creditPoolBalance
  }

  static fromBytes (bytes: Uint8Array): CbTx {
    const dataView = new DataView(bytes.buffer)

    const version = dataView.getUint16(0, true)
    const height = dataView.getUint32(2, true)

    const merkleRootMNList = bytes.slice(6, 38)
    let merkleRootQuorums

    if (version >= 2) {
      merkleRootQuorums = bytes.slice(38, 70)
    }

    let bestCLHeightDiff
    let bestCLSignature
    let creditPoolBalance

    if (version >= 3) {
      bestCLHeightDiff = BigInt(decodeCompactSize(70, bytes))
      bestCLSignature = bytesToHex(bytes.slice(70 + getCompactVariableSize(bestCLHeightDiff), 70 + getCompactVariableSize(bestCLHeightDiff) + 96))
      creditPoolBalance = dataView.getBigInt64(70 + getCompactVariableSize(bestCLHeightDiff) + 96, true)
    }

    return new CbTx(version, height, bytesToHex(merkleRootMNList.toReversed()), merkleRootQuorums != null ? bytesToHex(merkleRootQuorums.toReversed()) : undefined, bestCLHeightDiff, bestCLSignature, creditPoolBalance)
  }

  static fromHex (hex: string): CbTx {
    return CbTx.fromBytes(hexToBytes(hex))
  }

  bytes (): Uint8Array {
    const versionBytes = new Uint8Array(2)
    const heightBytes = new Uint8Array(4)
    const creditPoolBalanceBytes = new Uint8Array(this.version >= 3 ? 8 : 0)

    new DataView(versionBytes.buffer).setUint16(0, this.version, true)
    new DataView(heightBytes.buffer).setUint32(0, this.height, true)

    const merkleRootMNListBytes = new Uint8Array(32)
    merkleRootMNListBytes.set(hexToBytes(this.merkleRootMNList).toReversed(), 0)

    let merkleRootQuorumsBytes = new Uint8Array(0)

    if (this.version >= 2) {
      merkleRootQuorumsBytes = new Uint8Array(32)
      merkleRootQuorumsBytes.set(hexToBytes(this.merkleRootQuorums ?? '').toReversed())
    }

    let bestCLHeightDiffBytes: Uint8Array<ArrayBufferLike> = new Uint8Array(0)
    let bestCLSignatureBytes: Uint8Array<ArrayBufferLike> = new Uint8Array(0)

    if (this.version >= 3) {
      new DataView(creditPoolBalanceBytes.buffer).setBigInt64(0, this.creditPoolBalance ?? 0n, true)

      bestCLHeightDiffBytes = encodeCompactSize(this.bestCLHeightDiff ?? 0)
      bestCLSignatureBytes = new Uint8Array(96)
      bestCLSignatureBytes.set(hexToBytes(this.bestCLSignature ?? ''))
    }

    const out = new Uint8Array(38 + merkleRootQuorumsBytes.byteLength + bestCLHeightDiffBytes.byteLength + bestCLSignatureBytes.byteLength + creditPoolBalanceBytes.byteLength)

    out.set(versionBytes, 0)
    out.set(heightBytes, versionBytes.byteLength)
    out.set(merkleRootMNListBytes, versionBytes.byteLength + heightBytes.byteLength)
    out.set(merkleRootQuorumsBytes, versionBytes.byteLength + heightBytes.byteLength + merkleRootMNListBytes.byteLength)
    out.set(bestCLHeightDiffBytes, versionBytes.byteLength + heightBytes.byteLength + merkleRootMNListBytes.byteLength + merkleRootQuorumsBytes.byteLength)
    out.set(bestCLSignatureBytes, versionBytes.byteLength + heightBytes.byteLength + merkleRootMNListBytes.byteLength + merkleRootQuorumsBytes.byteLength + bestCLHeightDiffBytes.byteLength)
    out.set(creditPoolBalanceBytes, versionBytes.byteLength + heightBytes.byteLength + merkleRootMNListBytes.byteLength + merkleRootQuorumsBytes.byteLength + bestCLHeightDiffBytes.byteLength + bestCLSignatureBytes.byteLength)

    return out
  }

  hex (): string {
    return bytesToHex(this.bytes())
  }

  toJSON (): CbTxJSON {
    return {
      version: this.version,
      height: this.height,
      merkleRootMNList: this.merkleRootMNList,
      merkleRootQuorums: this.merkleRootQuorums ?? null,
      bestCLHeightDiff: this.bestCLHeightDiff != null ? String(this.bestCLHeightDiff) : null,
      bestCLSignature: this.bestCLSignature ?? null,
      creditPoolBalance: this.creditPoolBalance != null ? String(this.creditPoolBalance) : null
    }
  }
}
