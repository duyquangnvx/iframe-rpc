# Phase 3: Parent Bridge Implementation

**Priority**: High
**Status**: Pending
**Estimated Time**: 4 hours

## Context Links

- **Parent Plan**: [plan.md](./plan.md)
- **Previous Phase**: [Phase 2: Core Types](./phase-02-core-types.md)
- **Research**: [postMessage Best Practices](../reports/researcher-260117-0128-postmessage-patterns.md)
- **Research**: [Existing Libraries](../reports/researcher-260117-0128-existing-libraries.md)

## Overview

Implement the `ParentBridge` class that runs in the parent window. This class manages connection handshake with iframe, sends RPC requests with correlation IDs, handles responses with timeouts, and validates message origins.

## Key Insights from Research

1. **Handshake is essential** - can't rely on iframe load event alone
2. **Correlation IDs** with Map for pending requests is standard pattern
3. **MessageChannel** can simplify correlation but adds complexity
4. **Retry with exponential backoff** improves reliability
5. **Origin validation must be strict** - use exact string equality

## Requirements

### Functional Requirements
- [ ] Connect to iframe with handshake protocol
- [ ] Send RPC requests with auto-generated correlation IDs
- [ ] Receive and route responses to correct pending promises
- [ ] Handle timeouts with configurable duration
- [ ] Support per-call timeout override
- [ ] Validate message origins against allowlist
- [ ] Expose connection state
- [ ] Support bi-directional calls (optional handlers)
- [ ] Clean up listeners on destroy

### Non-Functional Requirements
- [ ] Connection completes within handshakeTimeout
- [ ] Memory: no leaks from pending requests (timeout cleanup)
- [ ] Thread-safe pending request map operations
- [ ] Minimal overhead per request

## Architecture

```
ParentBridge
├── State
│   ├── pending: Map<CorrelationId, PendingRequest>
│   ├── connectionState: ConnectionState
│   ├── targetWindow: Window | null
│   └── config: ParentBridgeConfig
├── Public Methods
│   ├── connect(): Promise<void>
│   ├── call<M>(method, payload, options?): Promise<Response>
│   ├── isConnected(): boolean
│   ├── getState(): ConnectionState
│   └── destroy(): void
├── Private Methods
│   ├── sendHandshake(): void
│   ├── handleMessage(event): void
│   ├── handleResponse(response): void
│   ├── handleHandshakeAck(ack): void
│   ├── isValidOrigin(origin): boolean
│   ├── createRequest<M>(method, payload): BridgeRequest
│   ├── generateId(): CorrelationId
│   └── log(level, message, data?): void
└── Events
    ├── message listener (window)
    └── state change callbacks
```

```
Handshake Flow
┌─────────────┐                    ┌─────────────┐
│   Parent    │                    │    Child    │
│   Bridge    │                    │   (iframe)  │
└──────┬──────┘                    └──────┬──────┘
       │                                  │
       │  ──────────────────────────────► │
       │     HandshakeRequest             │
       │     {type, id, version}          │
       │                                  │
       │  ◄────────────────────────────── │
       │     HandshakeAck                 │
       │     {type, id, requestId,        │
       │      version, methods}           │
       │                                  │
       │  Connection established          │
       ▼                                  ▼
```

## Related Code Files

### Files to Create
| File | Purpose |
|------|---------|
| `src/parent-bridge.ts` | Main ParentBridge class |
| `src/utils/correlation.ts` | ID generation utility |
| `src/utils/timeout.ts` | Timeout promise utility |

### Files to Modify
| File | Changes |
|------|---------|
| `src/index.ts` | Export ParentBridge |
| `src/types/index.ts` | Export any new types |

## Implementation Steps

### Step 1: Create Correlation ID Utility (15 min)

**src/utils/correlation.ts content:**
```typescript
/**
 * Correlation ID generation utilities
 *
 * @packageDocumentation
 */

import type { CorrelationId } from '../types';

/**
 * Counter for unique IDs within session
 */
let counter = 0;

/**
 * Generate a unique correlation ID
 * Uses timestamp + counter for uniqueness without crypto overhead
 */
export function generateCorrelationId(): CorrelationId {
  return `${Date.now().toString(36)}-${(++counter).toString(36)}`;
}

/**
 * Reset counter (for testing)
 * @internal
 */
export function resetCounter(): void {
  counter = 0;
}
```

### Step 2: Create Timeout Utility (20 min)

**src/utils/timeout.ts content:**
```typescript
/**
 * Timeout utilities for async operations
 *
 * @packageDocumentation
 */

import { BridgeError } from '../types';

/**
 * Pending request tracking
 */
export interface PendingRequest<T = unknown> {
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
  method: string;
  createdAt: number;
}

/**
 * Create a deferred promise with timeout
 */
export function createDeferredWithTimeout<T>(
  timeoutMs: number,
  method: string,
  onTimeout?: () => void
): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  cleanup: () => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  let timeoutId: ReturnType<typeof setTimeout>;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;

    timeoutId = setTimeout(() => {
      onTimeout?.();
      rej(BridgeError.timeout(method, timeoutMs));
    }, timeoutMs);
  });

  const cleanup = () => {
    clearTimeout(timeoutId);
  };

  return { promise, resolve, reject, cleanup };
}

/**
 * Race a promise against a timeout
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new BridgeError('BRIDGE_TIMEOUT', errorMessage));
      }, timeoutMs);
    }),
  ]);
}
```

### Step 3: Create Utils Index (5 min)

**src/utils/index.ts content:**
```typescript
/**
 * Re-export utilities
 *
 * @packageDocumentation
 */

export { generateCorrelationId, resetCounter } from './correlation';
export { createDeferredWithTimeout, withTimeout } from './timeout';
export type { PendingRequest } from './timeout';
```

### Step 4: Implement ParentBridge Class (2.5 hours)

**src/parent-bridge.ts content:**
```typescript
/**
 * Parent Bridge implementation
 *
 * @packageDocumentation
 */

import type {
  BridgeContract,
  BridgeMethod,
  BridgeRequest,
  BridgeResponse,
  BridgeResponseError,
  BridgeResponseSuccess,
  CallOptions,
  ConnectionState,
  HandshakeAck,
  HandshakeRequest,
  Logger,
  ParentBridgeConfig,
  PartialHandlers,
  RequestPayload,
  ResponsePayload,
} from './types';

import {
  BridgeError,
  BridgeErrorCode,
  DEFAULT_HANDSHAKE_TIMEOUT,
  DEFAULT_TIMEOUT,
  MessageType,
  isHandshakeAck,
  isRequest,
  isResponse,
} from './types';

import { generateCorrelationId } from './utils/correlation';
import type { PendingRequest } from './utils/timeout';

import { VERSION } from './index';

/**
 * Parent bridge for communicating with iframe
 *
 * @typeParam LocalContract - Methods this bridge exposes to child
 * @typeParam RemoteContract - Methods available on child bridge
 *
 * @example
 * ```typescript
 * interface ChildAPI extends BridgeContract {
 *   'user/get': { request: { id: string }, response: User };
 * }
 *
 * const bridge = new ParentBridge<{}, ChildAPI>({
 *   target: document.getElementById('child-iframe') as HTMLIFrameElement,
 *   origin: 'https://child.example.com',
 * });
 *
 * await bridge.connect();
 * const user = await bridge.call('user/get', { id: '123' });
 * ```
 */
export class ParentBridge<
  LocalContract extends BridgeContract = BridgeContract,
  RemoteContract extends BridgeContract = BridgeContract,
> {
  /** Pending requests awaiting response */
  private readonly pending = new Map<string, PendingRequest>();

  /** Current connection state */
  private state: ConnectionState = 'disconnected';

  /** Target window reference */
  private targetWindow: Window | null = null;

  /** Allowed origins (normalized to array) */
  private readonly allowedOrigins: readonly string[];

  /** Configuration */
  private readonly config: Required<
    Pick<
      ParentBridgeConfig<LocalContract, RemoteContract>,
      'timeout' | 'handshakeTimeout' | 'handshakeRetries' | 'retryDelay'
    >
  > &
    ParentBridgeConfig<LocalContract, RemoteContract>;

  /** Local method handlers for bi-directional calls */
  private readonly handlers: PartialHandlers<LocalContract>;

  /** Logger instance */
  private readonly logger: Logger;

  /** Bound message handler for cleanup */
  private readonly boundMessageHandler: (event: MessageEvent) => void;

  /** Remote methods discovered during handshake */
  private remoteMethods: readonly string[] = [];

  /** Handshake resolve function */
  private handshakeResolve: (() => void) | null = null;

  /** Handshake reject function */
  private handshakeReject: ((error: Error) => void) | null = null;

  constructor(config: ParentBridgeConfig<LocalContract, RemoteContract>) {
    // Normalize origin to array
    this.allowedOrigins = Array.isArray(config.origin)
      ? config.origin
      : [config.origin];

    // Validate origins
    if (this.allowedOrigins.length === 0) {
      throw new Error('At least one origin must be specified');
    }

    if (this.allowedOrigins.includes('*')) {
      console.warn(
        '[ParentBridge] Warning: Using "*" as origin is insecure. Use exact origins in production.'
      );
    }

    // Store config with defaults
    this.config = {
      ...config,
      timeout: config.timeout ?? DEFAULT_TIMEOUT,
      handshakeTimeout: config.handshakeTimeout ?? DEFAULT_HANDSHAKE_TIMEOUT,
      handshakeRetries: config.handshakeRetries ?? 3,
      retryDelay: config.retryDelay ?? 1000,
    };

    this.handlers = config.methods ?? ({} as PartialHandlers<LocalContract>);

    // Setup logger
    this.logger = config.logger ?? {
      debug: (msg, data) => config.debug && console.debug(`[ParentBridge] ${msg}`, data),
      info: (msg, data) => config.debug && console.info(`[ParentBridge] ${msg}`, data),
      warn: (msg, data) => console.warn(`[ParentBridge] ${msg}`, data),
      error: (msg, data) => console.error(`[ParentBridge] ${msg}`, data),
    };

    // Bind message handler
    this.boundMessageHandler = this.handleMessage.bind(this);
  }

  /**
   * Get the target window from config
   */
  private getTargetWindow(): Window {
    const { target } = this.config;

    if (target instanceof HTMLIFrameElement) {
      if (!target.contentWindow) {
        throw new BridgeError(
          BridgeErrorCode.NOT_CONNECTED,
          'Iframe contentWindow is not available. Ensure iframe is loaded.'
        );
      }
      return target.contentWindow;
    }

    return target;
  }

  /**
   * Connect to the child iframe
   *
   * @throws {BridgeError} If handshake fails or times out
   */
  async connect(): Promise<void> {
    if (this.state === 'destroyed') {
      throw BridgeError.destroyed();
    }

    if (this.state === 'connected') {
      this.logger.debug('Already connected');
      return;
    }

    if (this.state === 'connecting') {
      throw new BridgeError(
        BridgeErrorCode.HANDSHAKE_FAILED,
        'Connection already in progress'
      );
    }

    this.setState('connecting');

    try {
      this.targetWindow = this.getTargetWindow();

      // Add message listener
      window.addEventListener('message', this.boundMessageHandler);

      // Attempt handshake with retries
      await this.performHandshake();

      this.setState('connected');
      this.logger.info('Connected successfully', { remoteMethods: this.remoteMethods });
    } catch (error) {
      this.setState('disconnected');
      window.removeEventListener('message', this.boundMessageHandler);
      this.targetWindow = null;
      throw error;
    }
  }

  /**
   * Perform handshake with retry logic
   */
  private async performHandshake(): Promise<void> {
    const { handshakeTimeout, handshakeRetries, retryDelay } = this.config;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= handshakeRetries; attempt++) {
      try {
        await this.attemptHandshake(handshakeTimeout);
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.logger.warn(`Handshake attempt ${attempt} failed`, { error: lastError.message });

        if (attempt < handshakeRetries) {
          await this.sleep(retryDelay);
        }
      }
    }

    throw new BridgeError(
      BridgeErrorCode.HANDSHAKE_FAILED,
      `Handshake failed after ${handshakeRetries} attempts`,
      { cause: lastError ?? undefined }
    );
  }

  /**
   * Single handshake attempt
   */
  private attemptHandshake(timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.handshakeResolve = resolve;
      this.handshakeReject = reject;

      const timeoutId = setTimeout(() => {
        this.handshakeResolve = null;
        this.handshakeReject = null;
        reject(BridgeError.timeout('handshake', timeoutMs));
      }, timeoutMs);

      // Store timeout for cleanup
      const originalResolve = this.handshakeResolve;
      this.handshakeResolve = () => {
        clearTimeout(timeoutId);
        originalResolve();
      };

      // Send handshake request
      this.sendHandshake();
    });
  }

  /**
   * Send handshake request to child
   */
  private sendHandshake(): void {
    const request: HandshakeRequest = {
      type: MessageType.HANDSHAKE_REQUEST,
      id: generateCorrelationId(),
      timestamp: Date.now(),
      version: VERSION,
      methods: Object.keys(this.handlers),
      bridgeId: this.config.bridgeId,
    };

    this.logger.debug('Sending handshake', request);
    this.postMessage(request);
  }

  /**
   * Call a method on the child bridge
   *
   * @typeParam M - Method name from RemoteContract
   * @param method - Method to call
   * @param payload - Request payload
   * @param options - Call options (timeout override)
   * @returns Promise resolving to response data
   * @throws {BridgeError} On timeout, not connected, or remote error
   */
  async call<M extends BridgeMethod<RemoteContract>>(
    method: M,
    payload: RequestPayload<RemoteContract, M>,
    options?: CallOptions
  ): Promise<ResponsePayload<RemoteContract, M>> {
    if (this.state !== 'connected') {
      throw BridgeError.notConnected();
    }

    const id = generateCorrelationId();
    const timeout = options?.timeout ?? this.config.timeout;

    const request: BridgeRequest<RemoteContract, M> = {
      type: MessageType.REQUEST,
      id,
      timestamp: Date.now(),
      method,
      payload,
      bridgeId: this.config.bridgeId,
    };

    return new Promise((resolve, reject) => {
      // Setup timeout
      const timeoutId = setTimeout(() => {
        this.pending.delete(id);
        reject(BridgeError.timeout(method, timeout));
      }, timeout);

      // Store pending request
      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeoutId,
        method,
        createdAt: Date.now(),
      });

      // Send request
      this.logger.debug('Sending request', { method, id });
      this.postMessage(request);
    });
  }

  /**
   * Handle incoming messages
   */
  private handleMessage(event: MessageEvent): void {
    // Validate origin
    if (!this.isValidOrigin(event.origin)) {
      this.logger.warn('Rejected message from invalid origin', { origin: event.origin });
      return;
    }

    // Validate source
    if (event.source !== this.targetWindow) {
      return;
    }

    const data = event.data;

    // Skip non-bridge messages
    if (!data || typeof data !== 'object' || !('type' in data)) {
      return;
    }

    // Handle handshake acknowledgment
    if (isHandshakeAck(data)) {
      this.handleHandshakeAck(data);
      return;
    }

    // Handle response
    if (isResponse(data)) {
      this.handleResponse(data);
      return;
    }

    // Handle request (bi-directional)
    if (isRequest(data)) {
      this.handleRequest(data);
      return;
    }
  }

  /**
   * Handle handshake acknowledgment
   */
  private handleHandshakeAck(ack: HandshakeAck): void {
    this.logger.debug('Received handshake ack', ack);

    this.remoteMethods = ack.methods;

    if (this.handshakeResolve) {
      this.handshakeResolve();
      this.handshakeResolve = null;
      this.handshakeReject = null;
    }
  }

  /**
   * Handle response message
   */
  private handleResponse(response: BridgeResponse): void {
    const pending = this.pending.get(response.requestId);

    if (!pending) {
      this.logger.warn('Received response for unknown request', {
        requestId: response.requestId,
      });
      return;
    }

    // Cleanup
    clearTimeout(pending.timeoutId);
    this.pending.delete(response.requestId);

    if (response.success) {
      this.logger.debug('Request succeeded', {
        method: pending.method,
        requestId: response.requestId,
      });
      pending.resolve((response as BridgeResponseSuccess).data);
    } else {
      const errorResponse = response as BridgeResponseError;
      this.logger.debug('Request failed', {
        method: pending.method,
        error: errorResponse.error,
      });
      pending.reject(
        new BridgeError(
          errorResponse.error.code as typeof BridgeErrorCode[keyof typeof BridgeErrorCode],
          errorResponse.error.message,
          { details: errorResponse.error.details }
        )
      );
    }
  }

  /**
   * Handle incoming request (bi-directional)
   */
  private async handleRequest(request: BridgeRequest): Promise<void> {
    const { method, payload, id } = request;

    const handler = this.handlers[method as keyof LocalContract];

    if (!handler) {
      this.sendErrorResponse(id, BridgeError.methodNotFound(method));
      return;
    }

    try {
      const result = await handler(payload as never);
      this.sendSuccessResponse(id, result);
    } catch (error) {
      this.sendErrorResponse(id, BridgeError.handlerError(method, error));
    }
  }

  /**
   * Send success response
   */
  private sendSuccessResponse(requestId: string, data: unknown): void {
    const response: BridgeResponseSuccess = {
      type: MessageType.RESPONSE,
      id: generateCorrelationId(),
      timestamp: Date.now(),
      requestId,
      success: true,
      data,
      bridgeId: this.config.bridgeId,
    };

    this.postMessage(response);
  }

  /**
   * Send error response
   */
  private sendErrorResponse(requestId: string, error: BridgeError): void {
    const response: BridgeResponseError = {
      type: MessageType.RESPONSE,
      id: generateCorrelationId(),
      timestamp: Date.now(),
      requestId,
      success: false,
      error: error.toJSON(),
      bridgeId: this.config.bridgeId,
    };

    this.postMessage(response);
  }

  /**
   * Post message to target window
   */
  private postMessage(message: unknown): void {
    if (!this.targetWindow) {
      throw BridgeError.notConnected();
    }

    // Use first allowed origin for sending (or * if configured)
    const targetOrigin = this.allowedOrigins[0] ?? '*';
    this.targetWindow.postMessage(message, targetOrigin);
  }

  /**
   * Validate message origin
   */
  private isValidOrigin(origin: string): boolean {
    return (
      this.allowedOrigins.includes('*') ||
      this.allowedOrigins.includes(origin)
    );
  }

  /**
   * Update connection state
   */
  private setState(state: ConnectionState): void {
    const from = this.state;
    this.state = state;
    this.logger.debug('State changed', { from, to: state });
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Check if bridge is connected
   */
  isConnected(): boolean {
    return this.state === 'connected';
  }

  /**
   * Get current connection state
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * Get remote methods discovered during handshake
   */
  getRemoteMethods(): readonly string[] {
    return this.remoteMethods;
  }

  /**
   * Destroy the bridge and cleanup resources
   */
  destroy(): void {
    if (this.state === 'destroyed') {
      return;
    }

    this.logger.debug('Destroying bridge');

    // Reject all pending requests
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timeoutId);
      pending.reject(BridgeError.destroyed());
    }
    this.pending.clear();

    // Remove listener
    window.removeEventListener('message', this.boundMessageHandler);

    // Clear references
    this.targetWindow = null;
    this.handshakeResolve = null;
    this.handshakeReject = null;

    this.setState('destroyed');
  }
}
```

### Step 5: Update Main Index (10 min)

**Update src/index.ts to export ParentBridge:**
```typescript
// Add to exports
export { ParentBridge } from './parent-bridge';
```

## Todo List

- [ ] Create `src/utils/correlation.ts`
- [ ] Create `src/utils/timeout.ts`
- [ ] Create `src/utils/index.ts`
- [ ] Create `src/parent-bridge.ts`
- [ ] Update `src/index.ts` to export ParentBridge
- [ ] Run `pnpm typecheck` - should pass
- [ ] Run `pnpm lint` - should pass
- [ ] Run `pnpm build` - should succeed
- [ ] Test basic instantiation manually
- [ ] Verify bundle size still acceptable

## Success Criteria

- [ ] ParentBridge compiles without errors
- [ ] Type inference works for `call()` method
- [ ] Handshake timeout triggers correctly
- [ ] Origin validation rejects invalid origins
- [ ] destroy() cleans up all resources
- [ ] No memory leaks from pending requests

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Handshake race conditions | Medium | Use state machine pattern |
| Memory leaks from listeners | High | Ensure destroy() cleanup |
| Type inference complexity | Medium | Test with real usage |
| Origin validation bypass | Critical | Use strict equality only |

## Security Considerations

- [ ] Origin validation uses strict equality (no regex)
- [ ] Warning logged when using '*' origin
- [ ] Source validation checks event.source
- [ ] No eval or dynamic code execution
- [ ] Error messages don't leak internal details

## Next Steps

After completing this phase:
1. Proceed to [Phase 4: Child Bridge](./phase-04-child-bridge.md)
2. Implement ChildBridge with handler registration
3. Test handshake between ParentBridge and ChildBridge
