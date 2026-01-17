# Phase 4: Child Bridge Implementation

**Priority**: High
**Status**: Pending
**Estimated Time**: 3 hours

## Context Links

- **Parent Plan**: [plan.md](./plan.md)
- **Previous Phase**: [Phase 3: Parent Bridge](./phase-03-parent-bridge.md)
- **Research**: [postMessage Best Practices](../reports/researcher-260117-0128-postmessage-patterns.md)
- **Types Reference**: [Phase 2: Core Types](./phase-02-core-types.md)

## Overview

Implement the `ChildBridge` class that runs inside the iframe. This class listens for handshake requests, registers method handlers, processes incoming RPC requests, and sends responses back to the parent.

## Key Insights from Research

1. **Child must wait for handshake** - don't process requests before connected
2. **Auto-respond to handshake** - child responds immediately when ready
3. **Handler errors must be caught** - never let exceptions escape
4. **Origin validation equally important** in child
5. **Support calling back to parent** - bi-directional communication

## Requirements

### Functional Requirements
- [ ] Listen for handshake requests from parent
- [ ] Acknowledge handshake with method list
- [ ] Register handlers for RPC methods
- [ ] Process incoming requests and route to handlers
- [ ] Send success/error responses
- [ ] Support calling methods on parent (bi-directional)
- [ ] Validate message origins
- [ ] Expose connection state
- [ ] Clean up on destroy

### Non-Functional Requirements
- [ ] Handler execution doesn't block message loop
- [ ] Error handling prevents crashes
- [ ] Memory: cleanup on destroy
- [ ] No handler can block other handlers

## Architecture

```
ChildBridge
├── State
│   ├── connectionState: ConnectionState
│   ├── parentOrigin: string | null
│   ├── pending: Map<string, PendingRequest>
│   └── config: ChildBridgeConfig
├── Public Methods
│   ├── isConnected(): boolean
│   ├── getState(): ConnectionState
│   ├── call<M>(method, payload, options?): Promise<Response>
│   └── destroy(): void
├── Private Methods
│   ├── handleMessage(event): void
│   ├── handleHandshakeRequest(request): void
│   ├── handleRequest(request): void
│   ├── handleResponse(response): void
│   ├── isValidOrigin(origin): boolean
│   ├── sendResponse(requestId, success, data|error): void
│   └── log(level, message, data?): void
└── Events
    └── message listener (window)
```

```
Request-Response Flow
┌─────────────┐                    ┌─────────────┐
│   Parent    │                    │    Child    │
│   Bridge    │                    │   Bridge    │
└──────┬──────┘                    └──────┬──────┘
       │                                  │
       │  BridgeRequest                   │
       │  {type, id, method, payload}     │
       │  ────────────────────────────►   │
       │                                  │
       │                          handleRequest()
       │                          ├─ find handler
       │                          ├─ execute handler
       │                          └─ create response
       │                                  │
       │  BridgeResponse                  │
       │  {type, id, requestId,           │
       │   success, data|error}           │
       │  ◄────────────────────────────   │
       │                                  │
       ▼                                  ▼
```

## Related Code Files

### Files to Create
| File | Purpose |
|------|---------|
| `src/child-bridge.ts` | Main ChildBridge class |

### Files to Modify
| File | Changes |
|------|---------|
| `src/index.ts` | Export ChildBridge |

## Implementation Steps

### Step 1: Implement ChildBridge Class (2.5 hours)

**src/child-bridge.ts content:**
```typescript
/**
 * Child Bridge implementation
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
  ChildBridgeConfig,
  ConnectionState,
  HandshakeAck,
  HandshakeRequest,
  Logger,
  PartialHandlers,
  RequestPayload,
  ResponsePayload,
} from './types';

import {
  BridgeError,
  BridgeErrorCode,
  DEFAULT_TIMEOUT,
  MessageType,
  isHandshakeRequest,
  isRequest,
  isResponse,
} from './types';

import { generateCorrelationId } from './utils/correlation';
import type { PendingRequest } from './utils/timeout';

import { VERSION } from './index';

/**
 * Child bridge for responding to parent requests
 *
 * @typeParam LocalContract - Methods this bridge exposes to parent
 * @typeParam RemoteContract - Methods available on parent bridge
 *
 * @example
 * ```typescript
 * interface MyAPI extends BridgeContract {
 *   'user/get': { request: { id: string }, response: User };
 * }
 *
 * const bridge = new ChildBridge<MyAPI, {}>({
 *   origin: 'https://parent.example.com',
 *   methods: {
 *     'user/get': async ({ id }) => {
 *       return await fetchUser(id);
 *     },
 *   },
 * });
 * ```
 */
export class ChildBridge<
  LocalContract extends BridgeContract = BridgeContract,
  RemoteContract extends BridgeContract = BridgeContract,
> {
  /** Pending requests awaiting response (for bi-directional calls) */
  private readonly pending = new Map<string, PendingRequest>();

  /** Current connection state */
  private state: ConnectionState = 'disconnected';

  /** Parent window origin (set after handshake) */
  private parentOrigin: string | null = null;

  /** Allowed origins (normalized to array) */
  private readonly allowedOrigins: readonly string[];

  /** Configuration */
  private readonly config: Required<Pick<ChildBridgeConfig<LocalContract, RemoteContract>, 'timeout'>> &
    ChildBridgeConfig<LocalContract, RemoteContract>;

  /** Local method handlers */
  private readonly handlers: PartialHandlers<LocalContract>;

  /** Logger instance */
  private readonly logger: Logger;

  /** Bound message handler for cleanup */
  private readonly boundMessageHandler: (event: MessageEvent) => void;

  /** Parent methods discovered during handshake */
  private parentMethods: readonly string[] = [];

  constructor(config: ChildBridgeConfig<LocalContract, RemoteContract>) {
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
        '[ChildBridge] Warning: Using "*" as origin is insecure. Use exact origins in production.'
      );
    }

    // Store config with defaults
    this.config = {
      ...config,
      timeout: config.timeout ?? DEFAULT_TIMEOUT,
    };

    this.handlers = config.methods;

    // Setup logger
    this.logger = config.logger ?? {
      debug: (msg, data) => config.debug && console.debug(`[ChildBridge] ${msg}`, data),
      info: (msg, data) => config.debug && console.info(`[ChildBridge] ${msg}`, data),
      warn: (msg, data) => console.warn(`[ChildBridge] ${msg}`, data),
      error: (msg, data) => console.error(`[ChildBridge] ${msg}`, data),
    };

    // Bind and attach message handler immediately
    this.boundMessageHandler = this.handleMessage.bind(this);
    window.addEventListener('message', this.boundMessageHandler);

    this.logger.debug('Child bridge initialized, waiting for handshake');
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

    const data = event.data;

    // Skip non-bridge messages
    if (!data || typeof data !== 'object' || !('type' in data)) {
      return;
    }

    // Handle handshake request
    if (isHandshakeRequest(data)) {
      this.handleHandshakeRequest(data, event.origin, event.source as Window);
      return;
    }

    // Only process other messages if connected
    if (this.state !== 'connected') {
      this.logger.warn('Received message before connected, ignoring', { type: data.type });
      return;
    }

    // Verify origin matches the connected parent
    if (event.origin !== this.parentOrigin) {
      this.logger.warn('Origin mismatch after connection', {
        expected: this.parentOrigin,
        received: event.origin,
      });
      return;
    }

    // Handle request
    if (isRequest(data)) {
      this.handleRequest(data, event.source as Window);
      return;
    }

    // Handle response (bi-directional)
    if (isResponse(data)) {
      this.handleResponse(data);
      return;
    }
  }

  /**
   * Handle handshake request from parent
   */
  private handleHandshakeRequest(
    request: HandshakeRequest,
    origin: string,
    source: Window
  ): void {
    this.logger.debug('Received handshake request', { version: request.version, origin });

    // Store parent info
    this.parentOrigin = origin;
    this.parentMethods = request.methods ?? [];

    // Send acknowledgment
    const ack: HandshakeAck = {
      type: MessageType.HANDSHAKE_ACK,
      id: generateCorrelationId(),
      timestamp: Date.now(),
      version: VERSION,
      methods: Object.keys(this.handlers),
      requestId: request.id,
      bridgeId: this.config.bridgeId,
    };

    this.logger.debug('Sending handshake ack', ack);
    source.postMessage(ack, origin);

    // Update state
    this.setState('connected');
    this.logger.info('Connected to parent', { origin, parentMethods: this.parentMethods });
  }

  /**
   * Handle incoming RPC request
   */
  private async handleRequest(request: BridgeRequest, source: Window): Promise<void> {
    const { method, payload, id } = request;

    this.logger.debug('Received request', { method, id });

    const handler = this.handlers[method as keyof LocalContract];

    if (!handler) {
      this.logger.warn('Method not found', { method });
      this.sendErrorResponse(source, id, BridgeError.methodNotFound(method));
      return;
    }

    try {
      // Execute handler (may be sync or async)
      const result = await Promise.resolve(handler(payload as never));
      this.sendSuccessResponse(source, id, result);
    } catch (error) {
      this.logger.error('Handler error', { method, error });
      this.sendErrorResponse(source, id, BridgeError.handlerError(method, error));
    }
  }

  /**
   * Handle response message (bi-directional)
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
   * Send success response to parent
   */
  private sendSuccessResponse(target: Window, requestId: string, data: unknown): void {
    if (!this.parentOrigin) {
      this.logger.error('Cannot send response: not connected');
      return;
    }

    const response: BridgeResponseSuccess = {
      type: MessageType.RESPONSE,
      id: generateCorrelationId(),
      timestamp: Date.now(),
      requestId,
      success: true,
      data,
      bridgeId: this.config.bridgeId,
    };

    this.logger.debug('Sending success response', { requestId });
    target.postMessage(response, this.parentOrigin);
  }

  /**
   * Send error response to parent
   */
  private sendErrorResponse(target: Window, requestId: string, error: BridgeError): void {
    if (!this.parentOrigin) {
      this.logger.error('Cannot send response: not connected');
      return;
    }

    const response: BridgeResponseError = {
      type: MessageType.RESPONSE,
      id: generateCorrelationId(),
      timestamp: Date.now(),
      requestId,
      success: false,
      error: error.toJSON(),
      bridgeId: this.config.bridgeId,
    };

    this.logger.debug('Sending error response', { requestId, error: error.code });
    target.postMessage(response, this.parentOrigin);
  }

  /**
   * Call a method on the parent bridge (bi-directional)
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

    if (!this.parentOrigin) {
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

      // Send request to parent
      this.logger.debug('Sending request to parent', { method, id });
      window.parent.postMessage(request, this.parentOrigin!);
    });
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
   * Get parent methods discovered during handshake
   */
  getParentMethods(): readonly string[] {
    return this.parentMethods;
  }

  /**
   * Get the connected parent's origin
   */
  getParentOrigin(): string | null {
    return this.parentOrigin;
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
    this.parentOrigin = null;

    this.setState('destroyed');
  }
}
```

### Step 2: Update Main Index (10 min)

**Update src/index.ts to export ChildBridge:**
```typescript
// Add to exports (after ParentBridge)
export { ChildBridge } from './child-bridge';
```

### Step 3: Create Integration Example (20 min)

**Create examples/basic-usage.ts (for documentation):**
```typescript
/**
 * Basic Usage Example
 *
 * This file shows how to use ParentBridge and ChildBridge.
 * It is not meant to be executed directly.
 */

import type { BridgeContract } from '../src/types';
import { ParentBridge, ChildBridge } from '../src';

// Define the contract for child methods
interface ChildContract extends BridgeContract {
  'user/get': {
    request: { id: string };
    response: { id: string; name: string; email: string };
  };
  'user/update': {
    request: { id: string; name: string };
    response: { success: boolean };
  };
  'data/fetch': {
    request: { query: string };
    response: { results: unknown[] };
  };
}

// Define the contract for parent methods (bi-directional)
interface ParentContract extends BridgeContract {
  'auth/getToken': {
    request: Record<string, never>;
    response: { token: string };
  };
  'analytics/track': {
    request: { event: string; properties?: Record<string, unknown> };
    response: { success: boolean };
  };
}

// ============================================
// PARENT SIDE (main window)
// ============================================

async function setupParent() {
  const iframe = document.getElementById('child-iframe') as HTMLIFrameElement;

  // Create parent bridge
  const parent = new ParentBridge<ParentContract, ChildContract>({
    target: iframe,
    origin: 'https://child.example.com',
    timeout: 5000,
    handshakeTimeout: 3000,
    debug: true,
    // Bi-directional: methods child can call on parent
    methods: {
      'auth/getToken': async () => {
        return { token: 'jwt-token-here' };
      },
      'analytics/track': async ({ event, properties }) => {
        console.log('Track event:', event, properties);
        return { success: true };
      },
    },
  });

  // Connect to child
  await parent.connect();
  console.log('Connected to child, methods:', parent.getRemoteMethods());

  // Call child methods (fully typed!)
  const user = await parent.call('user/get', { id: '123' });
  console.log('User:', user.name, user.email);

  // Call with timeout override
  const data = await parent.call('data/fetch', { query: 'test' }, { timeout: 10000 });
  console.log('Data:', data.results);

  // Cleanup when done
  // parent.destroy();
}

// ============================================
// CHILD SIDE (inside iframe)
// ============================================

async function setupChild() {
  // Create child bridge with handlers
  const child = new ChildBridge<ChildContract, ParentContract>({
    origin: 'https://parent.example.com',
    timeout: 5000,
    debug: true,
    methods: {
      'user/get': async ({ id }) => {
        // Fetch user from database
        const user = await fetchUserFromDB(id);
        return {
          id: user.id,
          name: user.name,
          email: user.email,
        };
      },
      'user/update': async ({ id, name }) => {
        await updateUserInDB(id, { name });
        return { success: true };
      },
      'data/fetch': async ({ query }) => {
        const results = await searchDatabase(query);
        return { results };
      },
    },
  });

  // Child automatically connects when parent sends handshake
  // Wait for connection if needed
  await waitForConnection(child);

  // Bi-directional: call parent methods from child
  const { token } = await child.call('auth/getToken', {});
  console.log('Got token from parent:', token);

  // Track analytics on parent
  await child.call('analytics/track', {
    event: 'child_loaded',
    properties: { version: '1.0.0' },
  });
}

// Helper functions (mock implementations)
function fetchUserFromDB(id: string) {
  return Promise.resolve({ id, name: 'John Doe', email: 'john@example.com' });
}

function updateUserInDB(id: string, data: { name: string }) {
  return Promise.resolve();
}

function searchDatabase(query: string) {
  return Promise.resolve([{ id: 1, name: 'Result 1' }]);
}

function waitForConnection(bridge: ChildBridge): Promise<void> {
  return new Promise((resolve) => {
    if (bridge.isConnected()) {
      resolve();
      return;
    }
    const check = setInterval(() => {
      if (bridge.isConnected()) {
        clearInterval(check);
        resolve();
      }
    }, 100);
  });
}
```

## Todo List

- [ ] Create `src/child-bridge.ts`
- [ ] Update `src/index.ts` to export ChildBridge
- [ ] Run `pnpm typecheck` - should pass
- [ ] Run `pnpm lint` - should pass
- [ ] Run `pnpm build` - should succeed
- [ ] Verify bundle size is acceptable
- [ ] Create integration example for documentation

## Success Criteria

- [ ] ChildBridge compiles without errors
- [ ] Handlers receive correctly typed payloads
- [ ] Responses are correctly typed
- [ ] Bi-directional `call()` works
- [ ] Origin validation rejects invalid origins
- [ ] destroy() cleans up all resources

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Handler errors crash bridge | High | Wrap all handlers in try-catch |
| Missing parent reference | Medium | Check source on each message |
| Race condition on handshake | Low | Use state machine |
| Memory leak from handlers | Medium | Ensure async cleanup |

## Security Considerations

- [ ] Origin validation on every message
- [ ] Source validation ensures messages from parent
- [ ] Handler errors don't expose stack traces
- [ ] No eval or dynamic code execution
- [ ] Validate message structure before processing

## Next Steps

After completing this phase:
1. Proceed to [Phase 5: Testing](./phase-05-testing.md)
2. Write unit tests for both bridge classes
3. Write integration tests with iframe simulation
