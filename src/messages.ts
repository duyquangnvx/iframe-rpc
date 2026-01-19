/**
 * Message types for RPC communication
 */

import type { MethodContract } from './types';

/** Message type constants */
export const MESSAGE_TYPE = {
    REQUEST: 'iframe-rpc:request',
    RESPONSE: 'iframe-rpc:response',
    ERROR: 'iframe-rpc:error',
    FIRE_AND_FORGET: 'iframe-rpc:fire-and-forget',
} as const;

/** Base interface for all RPC messages */
interface BaseMessage {
    __iframeRpc: true;
    channel?: string;
}

/** Request message sent when calling a remote method */
export interface RequestMessage<T extends MethodContract = MethodContract> extends BaseMessage {
    type: typeof MESSAGE_TYPE.REQUEST;
    id: string;
    method: keyof T & string;
    args: unknown[];
}

/** Response message returned after successful method execution */
export interface ResponseMessage extends BaseMessage {
    type: typeof MESSAGE_TYPE.RESPONSE;
    id: string;
    result: unknown;
}

/** Error message returned when method execution fails */
export interface ErrorMessage extends BaseMessage {
    type: typeof MESSAGE_TYPE.ERROR;
    id: string;
    error: {
        message: string;
        code?: string;
        stack?: string;
    };
}

/** Fire-and-forget message for one-way notifications */
export interface FireAndForgetMessage<T extends MethodContract = MethodContract> extends BaseMessage {
    type: typeof MESSAGE_TYPE.FIRE_AND_FORGET;
    method: keyof T & string;
    args: unknown[];
}

/** Union type of all RPC messages */
export type RpcMessage<T extends MethodContract = MethodContract> =
    | RequestMessage<T>
    | ResponseMessage
    | ErrorMessage
    | FireAndForgetMessage<T>;
