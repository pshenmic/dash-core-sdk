import GRPCConnectionPool from "./src/grpcConnectionPool.js";
import { GetTransactionRequest, } from './proto/generated/core.js';
export class DashCoreSDK {
}

const run = async() => {
    const grpc = new GRPCConnectionPool('testnet');
    const client = grpc.getClient();
    const response = await client.getTransaction(GetTransactionRequest.fromPartial({ id: "8a3d76ff9a063ad909cdfa8f4f2fb5b3d32b349decd16ee2c42212f5e319d3cd" }));
    console.log(response.height);
}


run().catch(console.error)
