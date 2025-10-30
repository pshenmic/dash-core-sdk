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
    } catch (err) {
        console.log('this node doesn\'t contains active masternode')
    }

    const blockByHash = await sdk.getBlock({hash: '000000048fb130ac12fb4b985c89b49722261bbe807c76438c400c018581a3fe'})
    const blockByHeight = await sdk.getBlock({height: 1354927})
    if (JSON.stringify(Array.from(blockByHeight.block)) === JSON.stringify(Array.from(blockByHash.block)) && blockByHeight.block.byteLength !== 0) {
        console.log(`block founded by hash and height: 000000048fb130ac12fb4b985c89b49722261bbe807c76438c400c018581a3fe and 1354927`)
    } else {
        console.log('blocks not found')
    }

    const bestBlockHeight = await sdk.getBestBlockHeight()
    console.log(`bestBlockHeight: ${bestBlockHeight.height}`)

    // const estimatedTransactionFee = await sdk.getEstimatedTransactionFee(1)
    // console.log(`estimatedTransactionFee: ${estimatedTransactionFee.fee}`)

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
