declare const Base58Check: {
    encode: (data: Uint8Array) => string;
    decode: (data: string, skipVerify?: boolean) => Uint8Array<ArrayBuffer>;
};
export { Base58Check };
