import { OPCODES_ENUM } from '../constants.js';
import { NetworkLike, ScriptChunk } from '../types.js';
export declare class Script {
    #private;
    constructor(script?: Script | Uint8Array | string | ScriptChunk[]);
    get parsedScriptChunks(): ScriptChunk[];
    set parsedScriptChunks(chunks: ScriptChunk[]);
    pushOpCode(opCode: OPCODES_ENUM, data?: Uint8Array): void;
    getAddress(network?: NetworkLike): string | undefined;
    static fromBytes(bytes: Uint8Array): Script;
    static fromHex(hex: string): Script;
    static fromASM(asm: string): Script;
    ASMString(): string;
    bytes(): Uint8Array<ArrayBufferLike>;
    hex(): string;
}
