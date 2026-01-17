/**
 * Re-export all types
 *
 * @packageDocumentation
 */

// Contract types
export type {
  BridgeContract,
  BridgeMethod,
  RequestPayload,
  ResponsePayload,
  MethodHandler,
  ContractHandlers,
  PartialHandlers,
} from "./contract";

export { createHandlers } from "./contract";

// Message types
export {
  MessageType,
  isRequest,
  isResponse,
  isHandshakeRequest,
  isHandshakeAck,
  isSuccessResponse,
  isErrorResponse,
} from "./messages";

export type {
  MessageTypeValue,
  CorrelationId,
  BridgeRequest,
  BridgeResponseSuccess,
  BridgeResponseError,
  BridgeResponse,
  HandshakeRequest,
  HandshakeAck,
  BridgeMessage,
} from "./messages";

// Error types
export { BridgeError, BridgeErrorCode } from "./errors";
export type { BridgeErrorCodeValue } from "./errors";

// Config types
export { DEFAULT_TIMEOUT, DEFAULT_HANDSHAKE_TIMEOUT } from "./config";

export type {
  LogLevel,
  Logger,
  BaseBridgeConfig,
  ParentBridgeConfig,
  ChildBridgeConfig,
  CallOptions,
  ConnectionState,
  ConnectionStateEvent,
} from "./config";
