import { MasternodeList } from './grpcConnectionPool.js';
export default function getDAPINodeList(network: 'testnet' | 'mainnet'): Promise<MasternodeList>;
