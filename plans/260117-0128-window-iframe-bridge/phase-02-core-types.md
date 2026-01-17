# Phase 2: Core Types

**Priority**: High
**Status**: Pending
**Estimated Time**: 3 hours

## Context Links

- **Parent Plan**: [plan.md](./plan.md)
- **Previous Phase**: [Phase 1: Project Setup](./phase-01-project-setup.md)
- **Research**: [TypeScript RPC Patterns](../reports/researcher-260117-0128-typescript-rpc-patterns.md)
- **Research**: [postMessage Best Practices](../reports/researcher-260117-0128-postmessage-patterns.md)

## Overview

Define the core TypeScript types that power the library's type safety. This includes the BridgeContract interface pattern, message types with discriminated unions, error types, and configuration types.

## Key Insights from Research

1. **Contract-first design** enables full type inference without manual generics
2. **Discriminated unions** on `type` field enable TypeScript narrowing
3. **Mapped types** with `keyof` preserve literal types for method names
4. **Conditional types** enable response type inference from method name
5. **Branded types** are optional - discriminated unions suffice for our use case

## Requirements

### Functional Requirements
- [ ] Define BridgeContract interface pattern for method declarations
- [ ] Create Request message type with method and payload
- [ ] Create Response message type with success/error discriminant
- [ ] Create Handshake message types for connection protocol
- [ ] Define BridgeError class with error codes
- [ ] Create BridgeConfig type with all options
- [ ] Support type inference for request payload and response data

### Non-Functional Requirements
- [ ] Types compile in TypeScript strict mode
- [ ] No `any` types in public API
- [ ] Zero runtime overhead for types
- [ ] Types are self-documenting with JSDoc

## Architecture

```
Type Hierarchy
├── BridgeContract (user-defined)
│   └── { methodName: { request: T, response: R } }
├── Messages
│   ├── BridgeRequest<M>
│   ├── BridgeResponse<M>
│   ├── HandshakeRequest
│   └── HandshakeAck
├── Errors
│   └── BridgeError (code, message, cause)
└── Config
    ├── ParentBridgeConfig
    └── ChildBridgeConfig
```

## Related Code Files

### Files to Create
| File | Purpose |
|------|---------|
| `src/types/contract.ts` | BridgeContract pattern and inference |
| `src/types/messages.ts` | Request, Response, Handshake types |
| `src/types/errors.ts` | Error class and error codes |
| `src/types/config.ts` | Configuration types |
| `src/types/index.ts` | Re-export all types |

### Files to Modify
| File | Changes |
|------|---------|
| `src/index.ts` | Export types |

## Implementation Steps

### Step 1: Create Contract Types (45 min)

**src/types/contract.ts content:**
```typescript
/**
 * Contract type definitions for type-safe RPC
 *
 * @packageDocumentation
 */

/**
 * Base contract definition pattern.
 * Users extend this to define their RPC methods.
 *
 * @example
 * ```typescript
 * interface MyContract extends BridgeContract {
 *   'user/get': { request: { id: string }, response: { name: string } };
 *   'user/update': { request: { id: string, name: string }, response: { success: boolean } };
 * }
 * ```
 */
export interface BridgeContract {
  [method: string]: {
    request: unknown;
    response: unknown;
  };
}

/**
 * Extract method names from a contract
 */
export type BridgeMethod<C extends BridgeContract> = keyof C & string;

/**
 * Extract request payload type for a method
 */
export type RequestPayload<
  C extends BridgeContract,
  M extends BridgeMethod<C>,
> = C[M]['request'];

/**
 * Extract response payload type for a method
 */
export type ResponsePayload<
  C extends BridgeContract,
  M extends BridgeMethod<C>,
> = C[M]['response'];

/**
 * Handler function type for a specific method
 */
export type MethodHandler<C extends BridgeContract, M extends BridgeMethod<C>> = (
  payload: RequestPayload<C, M>
) => ResponsePayload<C, M> | Promise<ResponsePayload<C, M>>;

/**
 * Map of all handlers for a contract
 */
export type ContractHandlers<C extends BridgeContract> = {
  [M in BridgeMethod<C>]: MethodHandler<C, M>;
};

/**
 * Partial handlers - for registering subset of methods
 */
export type PartialHandlers<C extends BridgeContract> = Partial<ContractHandlers<C>>;
```

### Step 2: Create Message Types (45 min)

**src/types/messages.ts content:**
```typescript
/**
 * Message type definitions for postMessage communication
 *
 * @packageDocumentation
 */

import type { BridgeContract, BridgeMethod, RequestPayload, ResponsePayload } from './contract';

/**
 * Unique identifier for correlation
 */
export type CorrelationId = string;

/**
 * Message type discriminants
 */
export const MessageType = {
  REQUEST: 'bridge:request',
  RESPONSE: 'bridge:response',
  HANDSHAKE_REQUEST: 'bridge:handshake:request',
  HANDSHAKE_ACK: 'bridge:handshake:ack',
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
  readonly bridgeId?: string;
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
export type BridgeMessage =
  | BridgeRequest
  | BridgeResponse
  | HandshakeRequest
  | HandshakeAck;

/**
 * Type guard for request messages
 */
export function isRequest(msg: unknown): msg is BridgeRequest {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'type' in msg &&
    msg.type === MessageType.REQUEST
  );
}

/**
 * Type guard for response messages
 */
export function isResponse(msg: unknown): msg is BridgeResponse {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'type' in msg &&
    msg.type === MessageType.RESPONSE
  );
}

/**
 * Type guard for handshake request
 */
export function isHandshakeRequest(msg: unknown): msg is HandshakeRequest {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'type' in msg &&
    msg.type === MessageType.HANDSHAKE_REQUEST
  );
}

/**
 * Type guard for handshake acknowledgment
 */
export function isHandshakeAck(msg: unknown): msg is HandshakeAck {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'type' in msg &&
    msg.type === MessageType.HANDSHAKE_ACK
  );
}

/**
 * Type guard for success response
 */
export function isSuccessResponse<C extends BridgeContract, M extends BridgeMethod<C>>(
  response: BridgeResponse<C, M>
): response is BridgeResponseSuccess<C, M> {
  return response.success === true;
}

/**
 * Type guard for error response
 */
export function isErrorResponse(response: BridgeResponse): response is BridgeResponseError {
  return response.success === false;
}
```

### Step 3: Create Error Types (30 min)

**src/types/errors.ts content:**
```typescript
/**
 * Error types for bridge communication
 *
 * @packageDocumentation
 */

/**
 * Error codes for bridge operations
 */
export const BridgeErrorCode = {
  /** Request timed out */
  TIMEOUT: 'BRIDGE_TIMEOUT',
  /** Method not found on remote */
  METHOD_NOT_FOUND: 'BRIDGE_METHOD_NOT_FOUND',
  /** Handler threw an error */
  HANDLER_ERROR: 'BRIDGE_HANDLER_ERROR',
  /** Origin validation failed */
  INVALID_ORIGIN: 'BRIDGE_INVALID_ORIGIN',
  /** Connection not established */
  NOT_CONNECTED: 'BRIDGE_NOT_CONNECTED',
  /** Handshake failed */
  HANDSHAKE_FAILED: 'BRIDGE_HANDSHAKE_FAILED',
  /** Invalid message format */
  INVALID_MESSAGE: 'BRIDGE_INVALID_MESSAGE',
  /** Validation failed (Zod) */
  VALIDATION_ERROR: 'BRIDGE_VALIDATION_ERROR',
  /** Bridge already destroyed */
  DESTROYED: 'BRIDGE_DESTROYED',
  /** Unknown error */
  UNKNOWN: 'BRIDGE_UNKNOWN',
} as const;

export type BridgeErrorCodeValue = (typeof BridgeErrorCode)[keyof typeof BridgeErrorCode];

/**
 * Bridge error class with structured information
 */
export class BridgeError extends Error {
  /** Error code for programmatic handling */
  readonly code: BridgeErrorCodeValue;
  /** Additional error details */
  readonly details?: unknown;
  /** Original error if wrapping */
  readonly cause?: Error;

  constructor(
    code: BridgeErrorCodeValue,
    message: string,
    options?: { details?: unknown; cause?: Error }
  ) {
    super(message);
    this.name = 'BridgeError';
    this.code = code;
    this.details = options?.details;
    this.cause = options?.cause;

    // Maintains proper stack trace for where error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, BridgeError);
    }
  }

  /**
   * Create a timeout error
   */
  static timeout(method: string, timeoutMs: number): BridgeError {
    return new BridgeError(
      BridgeErrorCode.TIMEOUT,
      `Request to '${method}' timed out after ${timeoutMs}ms`
    );
  }

  /**
   * Create a method not found error
   */
  static methodNotFound(method: string): BridgeError {
    return new BridgeError(
      BridgeErrorCode.METHOD_NOT_FOUND,
      `Method '${method}' not found`
    );
  }

  /**
   * Create an invalid origin error
   */
  static invalidOrigin(origin: string, allowed: readonly string[]): BridgeError {
    return new BridgeError(BridgeErrorCode.INVALID_ORIGIN, `Origin '${origin}' not allowed`, {
      details: { origin, allowed },
    });
  }

  /**
   * Create a not connected error
   */
  static notConnected(): BridgeError {
    return new BridgeError(
      BridgeErrorCode.NOT_CONNECTED,
      'Bridge is not connected. Call connect() first.'
    );
  }

  /**
   * Create a destroyed error
   */
  static destroyed(): BridgeError {
    return new BridgeError(
      BridgeErrorCode.DESTROYED,
      'Bridge has been destroyed and cannot be used.'
    );
  }

  /**
   * Wrap an unknown error
   */
  static fromUnknown(error: unknown, context?: string): BridgeError {
    const message = error instanceof Error ? error.message : String(error);
    const cause = error instanceof Error ? error : undefined;
    return new BridgeError(
      BridgeErrorCode.UNKNOWN,
      context ? `${context}: ${message}` : message,
      { cause }
    );
  }

  /**
   * Create from handler error
   */
  static handlerError(method: string, error: unknown): BridgeError {
    const message = error instanceof Error ? error.message : String(error);
    const cause = error instanceof Error ? error : undefined;
    return new BridgeError(
      BridgeErrorCode.HANDLER_ERROR,
      `Handler for '${method}' threw an error: ${message}`,
      { cause }
    );
  }

  /**
   * Convert to plain object for serialization
   */
  toJSON(): { code: string; message: string; details?: unknown } {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}
```

### Step 4: Create Config Types (30 min)

**src/types/config.ts content:**
```typescript
/**
 * Configuration types for bridge instances
 *
 * @packageDocumentation
 */

import type { BridgeContract, PartialHandlers } from './contract';

/**
 * Default timeout in milliseconds
 */
export const DEFAULT_TIMEOUT = 10000;

/**
 * Default handshake timeout in milliseconds
 */
export const DEFAULT_HANDSHAKE_TIMEOUT = 5000;

/**
 * Logging levels
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'none';

/**
 * Logger interface for custom logging
 */
export interface Logger {
  debug: (message: string, data?: unknown) => void;
  info: (message: string, data?: unknown) => void;
  warn: (message: string, data?: unknown) => void;
  error: (message: string, data?: unknown) => void;
}

/**
 * Base configuration shared by parent and child
 */
export interface BaseBridgeConfig {
  /**
   * Default timeout for RPC calls in milliseconds
   * @default 10000
   */
  timeout?: number;

  /**
   * Unique identifier for this bridge instance
   * Useful when multiple bridges exist
   */
  bridgeId?: string;

  /**
   * Enable debug logging
   * @default false
   */
  debug?: boolean;

  /**
   * Custom logger implementation
   * If not provided, uses console
   */
  logger?: Logger;

  /**
   * Log level
   * @default 'warn'
   */
  logLevel?: LogLevel;
}

/**
 * Configuration for ParentBridge
 */
export interface ParentBridgeConfig<
  LocalContract extends BridgeContract = BridgeContract,
  RemoteContract extends BridgeContract = BridgeContract,
> extends BaseBridgeConfig {
  /**
   * Target iframe element or its contentWindow
   */
  target: HTMLIFrameElement | Window;

  /**
   * Allowed origin(s) for the child iframe
   * Use exact origins, never '*' in production
   */
  origin: string | readonly string[];

  /**
   * Local methods that child can call (bi-directional communication)
   */
  methods?: PartialHandlers<LocalContract>;

  /**
   * Timeout for handshake in milliseconds
   * @default 5000
   */
  handshakeTimeout?: number;

  /**
   * Number of handshake retry attempts
   * @default 3
   */
  handshakeRetries?: number;

  /**
   * Delay between retry attempts in milliseconds
   * @default 1000
   */
  retryDelay?: number;
}

/**
 * Configuration for ChildBridge
 */
export interface ChildBridgeConfig<
  LocalContract extends BridgeContract = BridgeContract,
  RemoteContract extends BridgeContract = BridgeContract,
> extends BaseBridgeConfig {
  /**
   * Allowed origin(s) for the parent window
   * Use exact origins, never '*' in production
   */
  origin: string | readonly string[];

  /**
   * Local methods that parent can call
   */
  methods: PartialHandlers<LocalContract>;

  /**
   * Methods that the parent provides (for validation)
   */
  remoteMethods?: readonly (keyof RemoteContract & string)[];
}

/**
 * Options for individual RPC calls
 */
export interface CallOptions {
  /**
   * Override default timeout for this call
   */
  timeout?: number;
}

/**
 * Connection state
 */
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'destroyed';

/**
 * Connection state change event
 */
export interface ConnectionStateEvent {
  /** Previous state */
  from: ConnectionState;
  /** New state */
  to: ConnectionState;
  /** Timestamp of change */
  timestamp: number;
}
```

### Step 5: Create Types Index (15 min)

**src/types/index.ts content:**
```typescript
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
} from './contract';

// Message types
export {
  MessageType,
  isRequest,
  isResponse,
  isHandshakeRequest,
  isHandshakeAck,
  isSuccessResponse,
  isErrorResponse,
} from './messages';

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
} from './messages';

// Error types
export { BridgeError, BridgeErrorCode } from './errors';
export type { BridgeErrorCodeValue } from './errors';

// Config types
export { DEFAULT_TIMEOUT, DEFAULT_HANDSHAKE_TIMEOUT } from './config';

export type {
  LogLevel,
  Logger,
  BaseBridgeConfig,
  ParentBridgeConfig,
  ChildBridgeConfig,
  CallOptions,
  ConnectionState,
  ConnectionStateEvent,
} from './config';
```

### Step 6: Update Main Index (15 min)

**src/index.ts content:**
```typescript
/**
 * Window-Iframe Bridge
 *
 * Type-safe window-iframe communication library for micro-frontends.
 *
 * @example
 * ```typescript
 * // Define your contract
 * interface MyContract extends BridgeContract {
 *   'user/get': { request: { id: string }, response: { name: string } };
 * }
 *
 * // Parent side
 * const parent = new ParentBridge<{}, MyContract>({
 *   target: iframe,
 *   origin: 'https://child.example.com',
 * });
 * await parent.connect();
 * const user = await parent.call('user/get', { id: '123' });
 *
 * // Child side
 * const child = new ChildBridge<MyContract, {}>({
 *   origin: 'https://parent.example.com',
 *   methods: {
 *     'user/get': async ({ id }) => ({ name: 'John' }),
 *   },
 * });
 * ```
 *
 * @packageDocumentation
 */

// Version
export const VERSION = '0.0.1';

// Re-export all types
export * from './types';

// Classes will be exported here after implementation
// export { ParentBridge } from './parent-bridge';
// export { ChildBridge } from './child-bridge';
```

## Todo List

- [ ] Create `src/types/contract.ts` with BridgeContract pattern
- [ ] Create `src/types/messages.ts` with Request/Response types
- [ ] Create `src/types/errors.ts` with BridgeError class
- [ ] Create `src/types/config.ts` with configuration types
- [ ] Create `src/types/index.ts` to re-export all types
- [ ] Update `src/index.ts` to export types
- [ ] Run `pnpm typecheck` - should pass
- [ ] Run `pnpm lint` - should pass
- [ ] Run `pnpm build` - should succeed
- [ ] Verify all types work with strict mode

## Success Criteria

- [ ] All types compile without errors in strict mode
- [ ] No `any` types in public API
- [ ] Type inference works for method payloads
- [ ] JSDoc comments on all exported types
- [ ] Build produces proper `.d.ts` files

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Generic type complexity | Medium | Start simple, add generics incrementally |
| Type inference not working | High | Write type tests to verify inference |
| Strict mode incompatibility | Low | Design types with strict mode in mind |

## Security Considerations

- [ ] Error messages don't leak sensitive data
- [ ] Origin type enforces string (no wildcards in types)
- [ ] Validation helpers prevent prototype pollution

## Next Steps

After completing this phase:
1. Proceed to [Phase 3: Parent Bridge](./phase-03-parent-bridge.md)
2. Implement ParentBridge class using these types
3. Test type inference with actual usage examples
