import {DashCoreSDK, BloomFilter} from "./src/DashCoreSDK.js";
import {base58} from '@scure/base'
import bloomFilter from 'bloom-filter'
import {hexToBytes} from "./src/utils";

const getVarIntBuffer = function (n) {
    let dataView;
    if (n < 253) {
        const buf = new ArrayBuffer(1)
        dataView = new DataView(buf)
        dataView.setUint8(0, n);
    } else if (n < 0x10000) {
        const buf = new ArrayBuffer(1 + 2)
        dataView = new DataView(buf)
        dataView.setUint8(0, 253);
        dataView.setUint16(1, n, true);
    } else if (n < 0x100000000) {
        const buf = new ArrayBuffer(1 + 4)
        dataView = new DataView(buf)
        dataView.setUint8(0, 254);
        dataView.setUint32(1, n, true);
    } else {
        const buf = new ArrayBuffer(1 + 8)
        dataView = new DataView(buf)
        dataView.setUint8(0, 255);
        dataView.setInt32(1, n & -1, true);
        dataView.setUint32(5, Math.floor(n / 0x100000000), true);
    }
    return dataView.buffer;
};

const createBloomFilter = (vData: Uint8Array, nHashFuncs: number, nTweak: number, nFlags: number) => {
    const lengthBuffer = getVarIntBuffer(vData);
    const vDataLength = vData.length


    const fullLength = lengthBuffer + vDataLength + 4 + 4 + 1

    const buffer = new ArrayBuffer(fullLength)
    const dataView = new DataView(buffer);

    // bw.writeVarintNum(this.vData.length);
    // for (var i = 0; i < this.vData.length; i++) {
    //     bw.writeUInt8(this.vData[i]);
    // }
    // bw.writeUInt32LE(this.nHashFuncs);
    // bw.writeUInt32LE(this.nTweak);
    // bw.writeUInt8(this.nFlags);
    // return bw.concat();
}
export default function bytesToHex(bytes: Uint8Array): string {
    return Array.prototype.map.call(bytes, (x: number) => ('00' + x.toString(16)).slice(-2)).join('')
}

const run = async () => {
    const sdk = new DashCoreSDK()
    const addresses = ['yUiFYXhqPE9rtEmxGU7L4PjgEWDHSraHEV']

    const numberOfElements = 3;
    const falsePositiveRate = 0.0001;
    const bf = bloomFilter.create(numberOfElements, falsePositiveRate);

    bf.insert(base58.decode(addresses[0]).slice(1, 21));

    console.log(bf)

    const status = await sdk.getBlockchainStatus();

    if (status.chain?.bestBlockHash == null) {
        throw new Error("Best block hash not available")
    }

    const transaction = await sdk.getTransaction('2e8eaa85fdaa036097caa42a41a23c73d7d7761f1fa6c934c024839bbe39786d');
    console.log(`tx confirmations: ${transaction.confirmations}`);

    try {
        const mnStatus = await sdk.getMasternodeStatus()
    }catch(err) {
        console.log('this node doesn\'t contains active masternode')
    }

    const blockByHash = await sdk.getBlock({hash: '000000048fb130ac12fb4b985c89b49722261bbe807c76438c400c018581a3fe'})
    const blockByHeight = await sdk.getBlock({height: 1354927})
    if(JSON.stringify(Array.from(blockByHeight.block)) === JSON.stringify(Array.from(blockByHash.block)) && blockByHeight.block.byteLength !== 0) {
        console.log(`block founded by hash and height: 000000048fb130ac12fb4b985c89b49722261bbe807c76438c400c018581a3fe and 1354927`)
    }else{
        console.log('blocks not found')
    }

    const bestBlockHeight = await sdk.getBestBlockHeight()
    console.log(`bestBlockHeight: ${bestBlockHeight.height}`)

    // const estimatedTransactionFee = await sdk.getEstimatedTransactionFee(1)
    // console.log(`estimatedTransactionFee: ${estimatedTransactionFee.fee}`)

    // const broadcast = await sdk.broadcastTransaction(hexToBytes('000000010e0a8b020201964fa93bbfc815808c8c1e2340318679bc68e3071ee25c350c5f37802a7cf26a0100000001af12041bdcf7aee99df6358a915c98f5a83f085effdc98d98041e2cd189e4ccc11087072656f72646572e668c659af66aee1e72c186dde7b5b7e0a1d712a09c40d5721f622bf53c53155009cd1216cb718613e829750a8c3d17b535c28b53d44435a815e703c8aa366faaf011073616c746564446f6d61696e486173680a20758088f73e46cb8ebd34afc577b4c23de3a1ef5d3838f220554d097069a1cfc7000101411fc934588aa30c58acdb347c7badf53e983c34ebc62c72a9475c118cf29b535a495ee06c6e603a48229759aecb5327d5a3361a0bfe9cba5b2dd4302f55f227bd57'))
    // console.log(`broadcasted: ${broadcast.transactionId}`)

    const abortController = new AbortController()
    //
    // const stream = sdk.subscribeToTransactions(addresses)
    //
    //
    // try {
    //     for await (const response of stream) {
    //         console.log(response)
    //
    //         const resp = {
    //             type: 'instantLock',
    //             addresses: ''
    //         }
    //
    //         const resp = {
    //             type: 'instantLock',
    //             addresses: ''
    //         }
    //     }
    // } catch (e) {
    //     console.error(e)
    //     return
    // }


   // const stream = sdk.subscribeToTransactionsWithProofs({...bf.toObject()}, 0, true, status.chain?.bestBlockHash, 0, abortController)
    const stream = sdk.subscribeToMasternodeList()
   // setTimeout(() => abortController.abort('Timed out'), 3000)

    try {
        for await (const response of stream.responses) {
            console.log(response)
        }
    } catch (e) {
        console.error(e)
        return
    }
}


run().catch(console.error)
