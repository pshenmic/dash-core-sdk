export declare const BLOOM_FILTER_NUMBER_OF_ELEMENTS = 3;
export declare const DAPI_STREAM_RECONNECT_TIMEOUT: number;
export declare const DASH_VERSIONS: {
    mainnet: {
        pubKeyHash: number;
        scriptHash: number;
        bech32: string;
        wif: number;
        private: number;
        public: number;
    };
    testnet: {
        pubKeyHash: number;
        scriptHash: number;
        bech32: string;
        wif: number;
        private: number;
        public: number;
    };
};
export declare const FEE_PER_BYTE = 1;
export declare const MIN_FEE_RELAY = 1000;
export declare const SIGHASH_ALL = 1;
/**
 * 32 - txId size
 * 4 - vout size
 * 8 - max scriptSigSize size
 * 108 - max scripSig size (SIG + PubKey Inner)
 * 4 - sequence
 */
export declare const SIGNED_INPUT_MAX_SIZE: number;
/**
 * 20 P2SH bytes
 * 4 OP_CODE bytes
 * 34 P2PK bytes
 * 4 varint/operators bytes
 * total: 62 bytes
 */
export declare const CHANGE_OUTPUT_MAX_SIZE: number;
export declare const enum TransactionType {
    TRANSACTION_NORMAL = 0,
    TRANSACTION_PROVIDER_REGISTER = 1,
    TRANSACTION_PROVIDER_UPDATE_SERVICE = 2,
    TRANSACTION_PROVIDER_UPDATE_REGISTRAR = 3,
    TRANSACTION_PROVIDER_UPDATE_REVOKE = 4,
    TRANSACTION_COINBASE = 5,
    TRANSACTION_QUORUM_COMMITMENT = 6,
    TRANSACTION_MASTERNODE_HARD_FORK_SIGNAL = 7,
    TRANSACTION_ASSET_LOCK = 8,
    TRANSACTION_ASSET_UNLOCK = 9
}
export declare const TRANSACTION_VERSION = 3;
export declare const DEFAULT_NLOCK_TIME = 0;
/**
 * Before this value we must use block height as nLock value
 * On equal or greater this value, we must use unix timestamp
 * https://en.bitcoin.it/wiki/NLockTime
 */
export declare const NLOCK_TIME_BLOCK_BASED_LIMIT = 500000000;
export declare const OPCODES: {
    OP_0: number;
    OP_PUSHBYTES_1: number;
    OP_PUSHBYTES_2: number;
    OP_PUSHBYTES_3: number;
    OP_PUSHBYTES_4: number;
    OP_PUSHBYTES_5: number;
    OP_PUSHBYTES_6: number;
    OP_PUSHBYTES_7: number;
    OP_PUSHBYTES_8: number;
    OP_PUSHBYTES_9: number;
    OP_PUSHBYTES_10: number;
    OP_PUSHBYTES_11: number;
    OP_PUSHBYTES_12: number;
    OP_PUSHBYTES_13: number;
    OP_PUSHBYTES_14: number;
    OP_PUSHBYTES_15: number;
    OP_PUSHBYTES_16: number;
    OP_PUSHBYTES_17: number;
    OP_PUSHBYTES_18: number;
    OP_PUSHBYTES_19: number;
    OP_PUSHBYTES_20: number;
    OP_PUSHBYTES_21: number;
    OP_PUSHBYTES_22: number;
    OP_PUSHBYTES_23: number;
    OP_PUSHBYTES_24: number;
    OP_PUSHBYTES_25: number;
    OP_PUSHBYTES_26: number;
    OP_PUSHBYTES_27: number;
    OP_PUSHBYTES_28: number;
    OP_PUSHBYTES_29: number;
    OP_PUSHBYTES_30: number;
    OP_PUSHBYTES_31: number;
    OP_PUSHBYTES_32: number;
    OP_PUSHBYTES_33: number;
    OP_PUSHBYTES_34: number;
    OP_PUSHBYTES_35: number;
    OP_PUSHBYTES_36: number;
    OP_PUSHBYTES_37: number;
    OP_PUSHBYTES_38: number;
    OP_PUSHBYTES_39: number;
    OP_PUSHBYTES_40: number;
    OP_PUSHBYTES_41: number;
    OP_PUSHBYTES_42: number;
    OP_PUSHBYTES_43: number;
    OP_PUSHBYTES_44: number;
    OP_PUSHBYTES_45: number;
    OP_PUSHBYTES_46: number;
    OP_PUSHBYTES_47: number;
    OP_PUSHBYTES_48: number;
    OP_PUSHBYTES_49: number;
    OP_PUSHBYTES_50: number;
    OP_PUSHBYTES_51: number;
    OP_PUSHBYTES_52: number;
    OP_PUSHBYTES_53: number;
    OP_PUSHBYTES_54: number;
    OP_PUSHBYTES_55: number;
    OP_PUSHBYTES_56: number;
    OP_PUSHBYTES_57: number;
    OP_PUSHBYTES_58: number;
    OP_PUSHBYTES_59: number;
    OP_PUSHBYTES_60: number;
    OP_PUSHBYTES_61: number;
    OP_PUSHBYTES_62: number;
    OP_PUSHBYTES_63: number;
    OP_PUSHBYTES_64: number;
    OP_PUSHBYTES_65: number;
    OP_PUSHBYTES_66: number;
    OP_PUSHBYTES_67: number;
    OP_PUSHBYTES_68: number;
    OP_PUSHBYTES_69: number;
    OP_PUSHBYTES_70: number;
    OP_PUSHBYTES_71: number;
    OP_PUSHBYTES_72: number;
    OP_PUSHBYTES_73: number;
    OP_PUSHBYTES_74: number;
    OP_PUSHBYTES_75: number;
    OP_PUSHDATA1: number;
    OP_PUSHDATA2: number;
    OP_PUSHDATA4: number;
    OP_1NEGATE: number;
    OP_RESERVED: number;
    OP_TRUE: number;
    OP_1: number;
    OP_2: number;
    OP_3: number;
    OP_4: number;
    OP_5: number;
    OP_6: number;
    OP_7: number;
    OP_8: number;
    OP_9: number;
    OP_10: number;
    OP_11: number;
    OP_12: number;
    OP_13: number;
    OP_14: number;
    OP_15: number;
    OP_16: number;
    OP_NOP: number;
    OP_VER: number;
    OP_IF: number;
    OP_NOTIF: number;
    OP_VERIF: number;
    OP_VERNOTIF: number;
    OP_ELSE: number;
    OP_ENDIF: number;
    OP_VERIFY: number;
    OP_RETURN: number;
    OP_TOALTSTACK: number;
    OP_FROMALTSTACK: number;
    OP_2DROP: number;
    OP_2DUP: number;
    OP_3DUP: number;
    OP_2OVER: number;
    OP_2ROT: number;
    OP_2SWAP: number;
    OP_IFDUP: number;
    OP_DEPTH: number;
    OP_DROP: number;
    OP_DUP: number;
    OP_NIP: number;
    OP_OVER: number;
    OP_PICK: number;
    OP_ROLL: number;
    OP_ROT: number;
    OP_SWAP: number;
    OP_TUCK: number;
    OP_CAT: number;
    OP_SUBSTR: number;
    OP_LEFT: number;
    OP_RIGHT: number;
    OP_SIZE: number;
    OP_INVERT: number;
    OP_AND: number;
    OP_OR: number;
    OP_XOR: number;
    OP_EQUAL: number;
    OP_EQUALVERIFY: number;
    OP_RESERVED1: number;
    OP_RESERVED2: number;
    OP_1ADD: number;
    OP_1SUB: number;
    OP_2MUL: number;
    OP_2DIV: number;
    OP_NEGATE: number;
    OP_ABS: number;
    OP_NOT: number;
    OP_0NOTEQUAL: number;
    OP_ADD: number;
    OP_SUB: number;
    OP_MUL: number;
    OP_DIV: number;
    OP_MOD: number;
    OP_LSHIFT: number;
    OP_RSHIFT: number;
    OP_BOOLAND: number;
    OP_BOOLOR: number;
    OP_NUMEQUAL: number;
    OP_NUMEQUALVERIFY: number;
    OP_NUMNOTEQUAL: number;
    OP_LESSTHAN: number;
    OP_GREATERTHAN: number;
    OP_LESSTHANOREQUAL: number;
    OP_GREATERTHANOREQUAL: number;
    OP_MIN: number;
    OP_MAX: number;
    OP_WITHIN: number;
    OP_RIPEMD160: number;
    OP_SHA1: number;
    OP_SHA256: number;
    OP_HASH160: number;
    OP_HASH256: number;
    OP_CODESEPARATOR: number;
    OP_CHECKSIG: number;
    OP_CHECKSIGVERIFY: number;
    OP_CHECKMULTISIG: number;
    OP_CHECKMULTISIGVERIFY: number;
    OP_CHECKLOCKTIMEVERIFY: number;
    OP_CHECKSEQUENCEVERIFY: number;
    OP_NOP1: number;
    OP_NOP2: number;
    OP_NOP3: number;
    OP_NOP4: number;
    OP_NOP5: number;
    OP_NOP6: number;
    OP_NOP7: number;
    OP_NOP8: number;
    OP_NOP9: number;
    OP_NOP10: number;
    OP_CHECKSIGADD: number;
    OP_RETURN_187: number;
    OP_RETURN_188: number;
    OP_RETURN_189: number;
    OP_RETURN_190: number;
    OP_RETURN_191: number;
    OP_RETURN_192: number;
    OP_RETURN_193: number;
    OP_RETURN_194: number;
    OP_RETURN_195: number;
    OP_RETURN_196: number;
    OP_RETURN_197: number;
    OP_RETURN_198: number;
    OP_RETURN_199: number;
    OP_RETURN_200: number;
    OP_RETURN_201: number;
    OP_RETURN_202: number;
    OP_RETURN_203: number;
    OP_RETURN_204: number;
    OP_RETURN_205: number;
    OP_RETURN_206: number;
    OP_RETURN_207: number;
    OP_RETURN_208: number;
    OP_RETURN_209: number;
    OP_RETURN_210: number;
    OP_RETURN_211: number;
    OP_RETURN_212: number;
    OP_RETURN_213: number;
    OP_RETURN_214: number;
    OP_RETURN_215: number;
    OP_RETURN_216: number;
    OP_RETURN_217: number;
    OP_RETURN_218: number;
    OP_RETURN_219: number;
    OP_RETURN_220: number;
    OP_RETURN_221: number;
    OP_RETURN_222: number;
    OP_RETURN_223: number;
    OP_RETURN_224: number;
    OP_RETURN_225: number;
    OP_RETURN_226: number;
    OP_RETURN_227: number;
    OP_RETURN_228: number;
    OP_RETURN_229: number;
    OP_RETURN_230: number;
    OP_RETURN_231: number;
    OP_RETURN_232: number;
    OP_RETURN_233: number;
    OP_RETURN_234: number;
    OP_RETURN_235: number;
    OP_RETURN_236: number;
    OP_RETURN_237: number;
    OP_RETURN_238: number;
    OP_RETURN_239: number;
    OP_RETURN_240: number;
    OP_RETURN_241: number;
    OP_RETURN_242: number;
    OP_RETURN_243: number;
    OP_RETURN_244: number;
    OP_RETURN_245: number;
    OP_RETURN_246: number;
    OP_RETURN_247: number;
    OP_RETURN_248: number;
    OP_RETURN_249: number;
    OP_RETURN_250: number;
    OP_RETURN_251: number;
    OP_RETURN_252: number;
    OP_RETURN_253: number;
    OP_RETURN_254: number;
    OP_INVALIDOPCODE: number;
};
export type OPCODES_ENUM = keyof typeof OPCODES;
export declare enum Network {
    Mainnet = 0,
    Testnet = 1
}
/**
 * script network prefix:
 * mainnet: 16
 * testnet: 19
 *
 * for pubkey network prefix use this value:
 * mainnet: 76
 * testnet: 140
 */
export declare enum NetworkPrefix {
    ScriptPrefixTestnet = 19,
    PubkeyPrefixTestnet = 140,
    ScriptPrefixMainnet = 16,
    PubkeyPrefixMainnet = 76
}
export declare const PubKeyHashAddressNetworkPrefix: {
    0: NetworkPrefix;
    1: NetworkPrefix;
};
export declare const DEFAULT_NETWORK = Network.Testnet;
export declare const WIFNetworkPrefix: {
    204: Network;
    239: Network;
    0: number;
    1: number;
};
export declare const MAX_BLOCK_WEIGHT = 4000000;
export declare const MIN_TRANSACTION_WEIGHT: number;
export declare const MAX_BLOOM_FILTER_SIZE = 36000;
export declare const MAX_BLOOM_FILTER_FUNC_COUNT = 50;
export declare const BLOOM_FILTER_FBA_CONSTANT = 4221880213;
export declare const BLOOM_FILTER_FALSE_POSITIVE_RATE = 0.0001;
export declare const enum ExtraPayloadType {
    'ProRegTx' = 0,
    'ProUpServTx' = 1,
    'ProUpRegTx' = 2,
    'ProUpRevTx' = 3,
    'CbTx' = 4,
    'QcTx' = 5,
    'MnHfTx' = 6,
    'AssetLockTx' = 7,
    'AssetUnlockTx' = 8
}
