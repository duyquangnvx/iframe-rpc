/**
 * Message type definitions for postMessage communication
 *
 * @packageDocumentation
 */

import type { BridgeContract, BridgeMethod, RequestPayload, ResponsePayload } from "./contract";

/**
 * Unique identifier for correlation
 */
export type CorrelationId = string;

/**
 * Message type discriminants
 */
export const MessageType = {
  REQUEST: "bridge:request",
  RESPONSE: "bridge:response",
  HANDSHAKE_REQUEST: "bridge:handshake:request",
  HANDSHAKE_ACK: "bridge:handshake:ack",
} as const;

export type MessageTypeValue = (typeof MessageType)[keyof typeof MessageType];

/**
 * Base message structure
 */
interface BaseMessage {
  /** Message type discriminant */
  readonly type: MessageTypeValue;
  /** Unique message identifier */
  readonly id: CorrelationId;
  /** Timestamp of message creation */
  readonly timestamp: number;
  /** Bridge instance identifier (for multi-bridge scenarios) */
  readonly bridgeId?: string | undefined;
}

/**
 * RPC Request message
 */
export interface BridgeRequest<
  C extends BridgeContract = BridgeContract,
  M extends BridgeMethod<C> = BridgeMethod<C>,
> extends BaseMessage {
  readonly type: typeof MessageType.REQUEST;
  /** RPC method name */
  readonly method: M;
  /** Request payload */
  readonly payload: RequestPayload<C, M>;
}

/**
 * RPC Response message - success variant
 */
export interface BridgeResponseSuccess<
  C extends BridgeContract = BridgeContract,
  M extends BridgeMethod<C> = BridgeMethod<C>,
> extends BaseMessage {
  readonly type: typeof MessageType.RESPONSE;
  /** Correlation ID linking to original request */
  readonly requestId: CorrelationId;
  /** Success discriminant */
  readonly success: true;
  /** Response data */
  readonly data: ResponsePayload<C, M>;
}

/**
 * RPC Response message - error variant
 */
export interface BridgeResponseError extends BaseMessage {
  readonly type: typeof MessageType.RESPONSE;
  /** Correlation ID linking to original request */
  readonly requestId: CorrelationId;
  /** Error discriminant */
  readonly success: false;
  /** Error details */
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly details?: unknown;
  };
}

/**
 * Union of success and error responses
 */
export type BridgeResponse<
  C extends BridgeContract = BridgeContract,
  M extends BridgeMethod<C> = BridgeMethod<C>,
> = BridgeResponseSuccess<C, M> | BridgeResponseError;

/**
 * Handshake request from parent to child
 */
export interface HandshakeRequest extends BaseMessage {
  readonly type: typeof MessageType.HANDSHAKE_REQUEST;
  /** Parent bridge version */
  readonly version: string;
  /** Methods parent can handle (optional - for bi-directional) */
  readonly methods?: readonly string[];
}

/**
 * Handshake acknowledgment from child to parent
 */
export interface HandshakeAck extends BaseMessage {
  readonly type: typeof MessageType.HANDSHAKE_ACK;
  /** Child bridge version */
  readonly version: string;
  /** Methods child can handle */
  readonly methods: readonly string[];
  /** Acknowledgment of parent's handshake ID */
  readonly requestId: CorrelationId;
}

/**
 * Union of all message types
 */
export type BridgeMessage = BridgeRequest | BridgeResponse | HandshakeRequest | HandshakeAck;

/**
 * Type guard for request messages
 */
export function isRequest(msg: unknown): msg is BridgeRequest {
  return (
    typeof msg === "object" && msg !== null && "type" in msg && msg.type === MessageType.REQUEST
  );
}

/**
 * Type guard for response messages
 */
export function isResponse(msg: unknown): msg is BridgeResponse {
  return (
    typeof msg === "object" && msg !== null && "type" in msg && msg.type === MessageType.RESPONSE
  );
}

/**
 * Type guard for handshake request
 */
export function isHandshakeRequest(msg: unknown): msg is HandshakeRequest {
  return (
    typeof msg === "object" &&
    msg !== null &&
    "type" in msg &&
    msg.type === MessageType.HANDSHAKE_REQUEST
  );
}

/**
 * Type guard for handshake acknowledgment
 */
export function isHandshakeAck(msg: unknown): msg is HandshakeAck {
  return (
    typeof msg === "object" &&
    msg !== null &&
    "type" in msg &&
    msg.type === MessageType.HANDSHAKE_ACK
  );
}

/**
 * Type guard for success response
 */
export function isSuccessResponse<C extends BridgeContract, M extends BridgeMethod<C>>(
  response: BridgeResponse<C, M>,
): response is BridgeResponseSuccess<C, M> {
  return response.success === true;
}

/**
 * Type guard for error response
 */
export function isErrorResponse(response: BridgeResponse): response is BridgeResponseError {
  return response.success === false;
}
