import { BlockHeader } from './BlockHeader'
import { MerkleTree } from './MerkleTree'
import { hexToBytes } from '../utils'

export class MerkleBlock {
  blockHeader: BlockHeader
  merkleTree: MerkleTree

  constructor (blockHeader: BlockHeader, merkleTree: MerkleTree) {
    this.blockHeader = blockHeader
    this.merkleTree = merkleTree
  }

  static fromBytes (bytes: Uint8Array): MerkleBlock {
    const blockHeader = BlockHeader.fromBytes(bytes.slice(0, 80))

    const merkleTree = MerkleTree.fromBytes(bytes.slice(80))

    return new MerkleBlock(blockHeader, merkleTree)
  }

  static fromHex (hex: string): MerkleBlock {
    return MerkleBlock.fromBytes(hexToBytes(hex))
  }
}
