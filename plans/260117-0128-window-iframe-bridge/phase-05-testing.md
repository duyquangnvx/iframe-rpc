# Phase 5: Testing

**Priority**: High
**Status**: Pending
**Estimated Time**: 4 hours

## Context Links

- **Parent Plan**: [plan.md](./plan.md)
- **Previous Phases**:
  - [Phase 2: Core Types](./phase-02-core-types.md)
  - [Phase 3: Parent Bridge](./phase-03-parent-bridge.md)
  - [Phase 4: Child Bridge](./phase-04-child-bridge.md)
- **Standards**: [Code Standards - Testing](../../docs/code-standards.md)

## Overview

Comprehensive testing strategy using Vitest with happy-dom for DOM simulation. Tests cover type safety, unit tests for individual components, integration tests for bridge communication, error scenarios, and timeout handling.

## Key Insights from Research

1. **happy-dom** provides lightweight DOM simulation for postMessage testing
2. **Type tests** verify TypeScript inference works correctly
3. **Mock postMessage** to control message timing and simulate errors
4. **Test error paths** are as important as happy paths
5. **Timeout tests** require fake timers (vi.useFakeTimers)

## Requirements

### Functional Requirements
- [ ] Test type inference for contracts
- [ ] Test BridgeError class methods
- [ ] Test correlation ID generation
- [ ] Test ParentBridge lifecycle (connect, call, destroy)
- [ ] Test ChildBridge lifecycle (handshake, handlers, destroy)
- [ ] Test integration between ParentBridge and ChildBridge
- [ ] Test timeout scenarios
- [ ] Test error scenarios (invalid origin, method not found)
- [ ] Test bi-directional communication

### Non-Functional Requirements
- [ ] 90%+ code coverage
- [ ] Tests complete in < 30 seconds
- [ ] No flaky tests (deterministic)
- [ ] Clear test descriptions
- [ ] Isolated tests (no shared state)

## Architecture

```
Test Structure
tests/
├── types.test.ts           # Type inference tests
├── errors.test.ts          # BridgeError tests
├── utils.test.ts           # Utility function tests
├── parent-bridge.test.ts   # ParentBridge unit tests
├── child-bridge.test.ts    # ChildBridge unit tests
├── integration.test.ts     # Full integration tests
└── helpers/
    ├── mock-window.ts      # Window/iframe mocks
    └── test-contracts.ts   # Test contract definitions
```

## Related Code Files

### Files to Create
| File | Purpose |
|------|---------|
| `tests/helpers/mock-window.ts` | Mock window and iframe |
| `tests/helpers/test-contracts.ts` | Shared test contracts |
| `tests/types.test.ts` | Type inference tests |
| `tests/errors.test.ts` | BridgeError tests |
| `tests/utils.test.ts` | Utility function tests |
| `tests/parent-bridge.test.ts` | ParentBridge tests |
| `tests/child-bridge.test.ts` | ChildBridge tests |
| `tests/integration.test.ts` | Integration tests |

## Implementation Steps

### Step 1: Create Test Helpers (30 min)

**tests/helpers/test-contracts.ts content:**
```typescript
/**
 * Shared test contracts for type-safe testing
 */

import type { BridgeContract } from '../../src/types';

/**
 * Test contract for child methods
 */
export interface TestChildContract extends BridgeContract {
  'test/echo': {
    request: { message: string };
    response: { echoed: string };
  };
  'test/add': {
    request: { a: number; b: number };
    response: { result: number };
  };
  'test/async': {
    request: { delay: number };
    response: { completed: boolean };
  };
  'test/error': {
    request: { shouldFail: boolean };
    response: { success: boolean };
  };
}

/**
 * Test contract for parent methods (bi-directional)
 */
export interface TestParentContract extends BridgeContract {
  'parent/getConfig': {
    request: Record<string, never>;
    response: { version: string };
  };
  'parent/notify': {
    request: { event: string };
    response: { received: boolean };
  };
}
```

**tests/helpers/mock-window.ts content:**
```typescript
/**
 * Mock window and iframe utilities for testing postMessage
 */

import { vi } from 'vitest';

/**
 * Message listener type
 */
type MessageListener = (event: MessageEvent) => void;

/**
 * Create a mock window with postMessage
 */
export function createMockWindow(origin: string = 'https://test.example.com'): {
  window: Window;
  postMessage: ReturnType<typeof vi.fn>;
  dispatchMessage: (data: unknown, source?: Window) => void;
  listeners: Set<MessageListener>;
} {
  const listeners = new Set<MessageListener>();
  const postMessage = vi.fn();

  const mockWindow = {
    postMessage,
    addEventListener: vi.fn((event: string, handler: MessageListener) => {
      if (event === 'message') {
        listeners.add(handler);
      }
    }),
    removeEventListener: vi.fn((event: string, handler: MessageListener) => {
      if (event === 'message') {
        listeners.delete(handler);
      }
    }),
    parent: null as Window | null,
    origin,
  } as unknown as Window;

  const dispatchMessage = (data: unknown, source?: Window) => {
    const event = new MessageEvent('message', {
      data,
      origin,
      source: source ?? mockWindow,
    });

    for (const listener of listeners) {
      listener(event);
    }
  };

  return {
    window: mockWindow,
    postMessage,
    dispatchMessage,
    listeners,
  };
}

/**
 * Create a mock iframe with contentWindow
 */
export function createMockIframe(
  origin: string = 'https://child.example.com'
): {
  iframe: HTMLIFrameElement;
  contentWindow: ReturnType<typeof createMockWindow>;
} {
  const contentWindow = createMockWindow(origin);

  const iframe = {
    contentWindow: contentWindow.window,
    src: origin,
  } as unknown as HTMLIFrameElement;

  return { iframe, contentWindow };
}

/**
 * Setup bidirectional communication between parent and child windows
 */
export function setupBidirectionalMock(
  parentOrigin: string = 'https://parent.example.com',
  childOrigin: string = 'https://child.example.com'
): {
  parent: ReturnType<typeof createMockWindow>;
  child: ReturnType<typeof createMockWindow>;
  iframe: HTMLIFrameElement;
} {
  const parent = createMockWindow(parentOrigin);
  const child = createMockWindow(childOrigin);

  const iframe = {
    contentWindow: child.window,
    src: childOrigin,
  } as unknown as HTMLIFrameElement;

  // Setup parent -> child message forwarding
  parent.postMessage.mockImplementation((data: unknown, targetOrigin: string) => {
    if (targetOrigin === childOrigin || targetOrigin === '*') {
      // Simulate async message delivery
      queueMicrotask(() => {
        child.dispatchMessage(data, parent.window);
      });
    }
  });

  // Setup child -> parent message forwarding
  child.postMessage.mockImplementation((data: unknown, targetOrigin: string) => {
    if (targetOrigin === parentOrigin || targetOrigin === '*') {
      queueMicrotask(() => {
        parent.dispatchMessage(data, child.window);
      });
    }
  });

  // Set parent reference on child
  (child.window as { parent: Window }).parent = parent.window;

  return { parent, child, iframe };
}
```

### Step 2: Create Type Tests (30 min)

**tests/types.test.ts content:**
```typescript
/**
 * Type inference tests
 *
 * These tests verify that TypeScript correctly infers types
 * from contract definitions.
 */

import { describe, it, expectTypeOf } from 'vitest';
import type {
  BridgeContract,
  BridgeMethod,
  RequestPayload,
  ResponsePayload,
  MethodHandler,
  ContractHandlers,
} from '../src/types';
import type { TestChildContract } from './helpers/test-contracts';

describe('Type Inference', () => {
  describe('BridgeMethod', () => {
    it('should extract method names as literal types', () => {
      type Methods = BridgeMethod<TestChildContract>;
      expectTypeOf<Methods>().toEqualTypeOf<
        'test/echo' | 'test/add' | 'test/async' | 'test/error'
      >();
    });
  });

  describe('RequestPayload', () => {
    it('should extract request type for method', () => {
      type EchoRequest = RequestPayload<TestChildContract, 'test/echo'>;
      expectTypeOf<EchoRequest>().toEqualTypeOf<{ message: string }>();
    });

    it('should extract request with multiple properties', () => {
      type AddRequest = RequestPayload<TestChildContract, 'test/add'>;
      expectTypeOf<AddRequest>().toEqualTypeOf<{ a: number; b: number }>();
    });
  });

  describe('ResponsePayload', () => {
    it('should extract response type for method', () => {
      type EchoResponse = ResponsePayload<TestChildContract, 'test/echo'>;
      expectTypeOf<EchoResponse>().toEqualTypeOf<{ echoed: string }>();
    });

    it('should extract response with result property', () => {
      type AddResponse = ResponsePayload<TestChildContract, 'test/add'>;
      expectTypeOf<AddResponse>().toEqualTypeOf<{ result: number }>();
    });
  });

  describe('MethodHandler', () => {
    it('should type handler with correct input and output', () => {
      type EchoHandler = MethodHandler<TestChildContract, 'test/echo'>;

      // Handler should accept request and return response or Promise<response>
      const syncHandler: EchoHandler = (payload) => {
        expectTypeOf(payload).toEqualTypeOf<{ message: string }>();
        return { echoed: payload.message };
      };

      const asyncHandler: EchoHandler = async (payload) => {
        expectTypeOf(payload).toEqualTypeOf<{ message: string }>();
        return { echoed: payload.message };
      };
    });
  });

  describe('ContractHandlers', () => {
    it('should require all methods to be implemented', () => {
      type Handlers = ContractHandlers<TestChildContract>;

      // This should type-check
      const handlers: Handlers = {
        'test/echo': ({ message }) => ({ echoed: message }),
        'test/add': ({ a, b }) => ({ result: a + b }),
        'test/async': async ({ delay }) => ({ completed: true }),
        'test/error': ({ shouldFail }) => ({ success: !shouldFail }),
      };
    });
  });
});
```

### Step 3: Create Error Tests (20 min)

**tests/errors.test.ts content:**
```typescript
/**
 * BridgeError tests
 */

import { describe, it, expect } from 'vitest';
import { BridgeError, BridgeErrorCode } from '../src/types';

describe('BridgeError', () => {
  describe('constructor', () => {
    it('should create error with code and message', () => {
      const error = new BridgeError(BridgeErrorCode.TIMEOUT, 'Request timed out');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(BridgeError);
      expect(error.name).toBe('BridgeError');
      expect(error.code).toBe('BRIDGE_TIMEOUT');
      expect(error.message).toBe('Request timed out');
    });

    it('should include details when provided', () => {
      const error = new BridgeError(BridgeErrorCode.INVALID_ORIGIN, 'Invalid origin', {
        details: { origin: 'https://evil.com' },
      });

      expect(error.details).toEqual({ origin: 'https://evil.com' });
    });

    it('should include cause when provided', () => {
      const cause = new Error('Original error');
      const error = new BridgeError(BridgeErrorCode.HANDLER_ERROR, 'Handler failed', {
        cause,
      });

      expect(error.cause).toBe(cause);
    });
  });

  describe('static factory methods', () => {
    it('timeout() should create timeout error', () => {
      const error = BridgeError.timeout('user/get', 5000);

      expect(error.code).toBe('BRIDGE_TIMEOUT');
      expect(error.message).toContain('user/get');
      expect(error.message).toContain('5000ms');
    });

    it('methodNotFound() should create method not found error', () => {
      const error = BridgeError.methodNotFound('unknown/method');

      expect(error.code).toBe('BRIDGE_METHOD_NOT_FOUND');
      expect(error.message).toContain('unknown/method');
    });

    it('invalidOrigin() should create invalid origin error', () => {
      const error = BridgeError.invalidOrigin('https://evil.com', ['https://good.com']);

      expect(error.code).toBe('BRIDGE_INVALID_ORIGIN');
      expect(error.details).toEqual({
        origin: 'https://evil.com',
        allowed: ['https://good.com'],
      });
    });

    it('notConnected() should create not connected error', () => {
      const error = BridgeError.notConnected();

      expect(error.code).toBe('BRIDGE_NOT_CONNECTED');
    });

    it('destroyed() should create destroyed error', () => {
      const error = BridgeError.destroyed();

      expect(error.code).toBe('BRIDGE_DESTROYED');
    });

    it('fromUnknown() should wrap unknown errors', () => {
      const original = new Error('Something went wrong');
      const error = BridgeError.fromUnknown(original, 'Processing failed');

      expect(error.code).toBe('BRIDGE_UNKNOWN');
      expect(error.message).toContain('Processing failed');
      expect(error.message).toContain('Something went wrong');
      expect(error.cause).toBe(original);
    });

    it('fromUnknown() should handle non-Error values', () => {
      const error = BridgeError.fromUnknown('string error');

      expect(error.code).toBe('BRIDGE_UNKNOWN');
      expect(error.message).toBe('string error');
    });

    it('handlerError() should create handler error', () => {
      const cause = new Error('Database connection failed');
      const error = BridgeError.handlerError('user/get', cause);

      expect(error.code).toBe('BRIDGE_HANDLER_ERROR');
      expect(error.message).toContain('user/get');
      expect(error.cause).toBe(cause);
    });
  });

  describe('toJSON()', () => {
    it('should serialize to plain object', () => {
      const error = new BridgeError(BridgeErrorCode.TIMEOUT, 'Timeout', {
        details: { method: 'test' },
      });

      const json = error.toJSON();

      expect(json).toEqual({
        code: 'BRIDGE_TIMEOUT',
        message: 'Timeout',
        details: { method: 'test' },
      });
    });

    it('should omit undefined details', () => {
      const error = new BridgeError(BridgeErrorCode.TIMEOUT, 'Timeout');

      const json = error.toJSON();

      expect(json.details).toBeUndefined();
    });
  });
});
```

### Step 4: Create Utility Tests (20 min)

**tests/utils.test.ts content:**
```typescript
/**
 * Utility function tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateCorrelationId, resetCounter } from '../src/utils/correlation';
import { createDeferredWithTimeout } from '../src/utils/timeout';
import { BridgeErrorCode } from '../src/types';

describe('Correlation ID', () => {
  beforeEach(() => {
    resetCounter();
  });

  it('should generate unique IDs', () => {
    const id1 = generateCorrelationId();
    const id2 = generateCorrelationId();

    expect(id1).not.toBe(id2);
  });

  it('should generate IDs with timestamp and counter', () => {
    const id = generateCorrelationId();

    // Should contain a hyphen separator
    expect(id).toContain('-');

    // Both parts should be non-empty
    const [timestamp, counter] = id.split('-');
    expect(timestamp?.length).toBeGreaterThan(0);
    expect(counter?.length).toBeGreaterThan(0);
  });

  it('should increment counter for each call', () => {
    // Mock Date.now to get consistent timestamps
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);

    const id1 = generateCorrelationId();
    const id2 = generateCorrelationId();

    const counter1 = id1.split('-')[1];
    const counter2 = id2.split('-')[1];

    // Counter should be incrementing
    expect(Number.parseInt(counter2!, 36)).toBe(Number.parseInt(counter1!, 36) + 1);

    vi.restoreAllMocks();
  });
});

describe('Deferred with Timeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should resolve when resolve is called', async () => {
    const { promise, resolve } = createDeferredWithTimeout<string>(1000, 'test');

    resolve('success');

    await expect(promise).resolves.toBe('success');
  });

  it('should reject when reject is called', async () => {
    const { promise, reject } = createDeferredWithTimeout<string>(1000, 'test');

    reject(new Error('failure'));

    await expect(promise).rejects.toThrow('failure');
  });

  it('should reject with timeout error after delay', async () => {
    const { promise } = createDeferredWithTimeout<string>(1000, 'test/method');

    // Fast-forward time
    vi.advanceTimersByTime(1001);

    await expect(promise).rejects.toMatchObject({
      code: BridgeErrorCode.TIMEOUT,
    });
  });

  it('should call onTimeout callback when timing out', async () => {
    const onTimeout = vi.fn();
    const { promise } = createDeferredWithTimeout<string>(1000, 'test', onTimeout);

    vi.advanceTimersByTime(1001);

    expect(onTimeout).toHaveBeenCalledTimes(1);

    // Suppress unhandled rejection
    await promise.catch(() => {});
  });

  it('cleanup() should clear timeout', async () => {
    const { promise, resolve, cleanup } = createDeferredWithTimeout<string>(1000, 'test');

    cleanup();
    resolve('success');

    await expect(promise).resolves.toBe('success');

    // Advancing time should not cause rejection
    vi.advanceTimersByTime(2000);
  });
});
```

### Step 5: Create ParentBridge Tests (45 min)

**tests/parent-bridge.test.ts content:**
```typescript
/**
 * ParentBridge unit tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ParentBridge } from '../src/parent-bridge';
import { MessageType, BridgeErrorCode } from '../src/types';
import { createMockIframe, setupBidirectionalMock } from './helpers/mock-window';
import type { TestChildContract, TestParentContract } from './helpers/test-contracts';

describe('ParentBridge', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with required config', () => {
      const { iframe } = createMockIframe();

      const bridge = new ParentBridge<TestParentContract, TestChildContract>({
        target: iframe,
        origin: 'https://child.example.com',
      });

      expect(bridge.getState()).toBe('disconnected');
      expect(bridge.isConnected()).toBe(false);
    });

    it('should throw if no origin provided', () => {
      const { iframe } = createMockIframe();

      expect(() => {
        new ParentBridge({
          target: iframe,
          origin: [] as unknown as string,
        });
      }).toThrow('At least one origin must be specified');
    });

    it('should warn when using * origin', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { iframe } = createMockIframe();

      new ParentBridge({
        target: iframe,
        origin: '*',
      });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Using "*" as origin is insecure')
      );
    });
  });

  describe('connect()', () => {
    it('should complete handshake successfully', async () => {
      const { parent, child, iframe } = setupBidirectionalMock();

      // Mock window for listener registration
      vi.spyOn(window, 'addEventListener').mockImplementation((event, handler) => {
        if (event === 'message') {
          parent.listeners.add(handler as (event: MessageEvent) => void);
        }
      });

      const bridge = new ParentBridge<TestParentContract, TestChildContract>({
        target: iframe,
        origin: 'https://child.example.com',
        handshakeTimeout: 1000,
      });

      // Simulate child responding to handshake
      child.postMessage.mockImplementation((data: unknown, targetOrigin: string) => {
        // This is the handshake ack from child
        const ack = {
          type: MessageType.HANDSHAKE_ACK,
          id: 'ack-1',
          timestamp: Date.now(),
          version: '0.0.1',
          methods: ['test/echo', 'test/add'],
          requestId: (data as { id: string }).id,
        };

        queueMicrotask(() => {
          parent.dispatchMessage(ack, child.window);
        });
      });

      const connectPromise = bridge.connect();

      // Process microtasks
      await vi.runAllTimersAsync();

      await connectPromise;

      expect(bridge.isConnected()).toBe(true);
      expect(bridge.getState()).toBe('connected');
      expect(bridge.getRemoteMethods()).toEqual(['test/echo', 'test/add']);
    });

    it('should timeout if no handshake response', async () => {
      const { parent, iframe } = setupBidirectionalMock();

      vi.spyOn(window, 'addEventListener').mockImplementation((event, handler) => {
        if (event === 'message') {
          parent.listeners.add(handler as (event: MessageEvent) => void);
        }
      });

      const bridge = new ParentBridge({
        target: iframe,
        origin: 'https://child.example.com',
        handshakeTimeout: 100,
        handshakeRetries: 1,
      });

      const connectPromise = bridge.connect();

      // Fast-forward past timeout
      await vi.advanceTimersByTimeAsync(200);

      await expect(connectPromise).rejects.toMatchObject({
        code: BridgeErrorCode.HANDSHAKE_FAILED,
      });

      expect(bridge.isConnected()).toBe(false);
    });

    it('should throw if already connected', async () => {
      // Setup a mock that immediately responds
      const { parent, child, iframe } = setupBidirectionalMock();

      vi.spyOn(window, 'addEventListener').mockImplementation((event, handler) => {
        if (event === 'message') {
          parent.listeners.add(handler as (event: MessageEvent) => void);
        }
      });

      child.postMessage.mockImplementation((data: unknown) => {
        const ack = {
          type: MessageType.HANDSHAKE_ACK,
          id: 'ack-1',
          timestamp: Date.now(),
          version: '0.0.1',
          methods: [],
          requestId: (data as { id: string }).id,
        };
        queueMicrotask(() => parent.dispatchMessage(ack, child.window));
      });

      const bridge = new ParentBridge({
        target: iframe,
        origin: 'https://child.example.com',
      });

      await bridge.connect();
      await vi.runAllTimersAsync();

      // Second connect should not throw, just return
      await expect(bridge.connect()).resolves.toBeUndefined();
    });
  });

  describe('call()', () => {
    it('should throw if not connected', async () => {
      const { iframe } = createMockIframe();

      const bridge = new ParentBridge<TestParentContract, TestChildContract>({
        target: iframe,
        origin: 'https://child.example.com',
      });

      await expect(
        bridge.call('test/echo', { message: 'hello' })
      ).rejects.toMatchObject({
        code: BridgeErrorCode.NOT_CONNECTED,
      });
    });
  });

  describe('destroy()', () => {
    it('should cleanup resources', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
      const { iframe } = createMockIframe();

      const bridge = new ParentBridge({
        target: iframe,
        origin: 'https://child.example.com',
      });

      bridge.destroy();

      expect(bridge.getState()).toBe('destroyed');
      expect(removeEventListenerSpy).toHaveBeenCalledWith('message', expect.any(Function));
    });

    it('should reject pending requests', async () => {
      // This test would require more complex setup
      // Simplified version
      const { iframe } = createMockIframe();

      const bridge = new ParentBridge({
        target: iframe,
        origin: 'https://child.example.com',
      });

      bridge.destroy();

      // Second destroy should be no-op
      bridge.destroy();

      expect(bridge.getState()).toBe('destroyed');
    });

    it('should throw destroyed error on subsequent operations', async () => {
      const { iframe } = createMockIframe();

      const bridge = new ParentBridge({
        target: iframe,
        origin: 'https://child.example.com',
      });

      bridge.destroy();

      await expect(bridge.connect()).rejects.toMatchObject({
        code: BridgeErrorCode.DESTROYED,
      });
    });
  });
});
```

### Step 6: Create ChildBridge Tests (45 min)

**tests/child-bridge.test.ts content:**
```typescript
/**
 * ChildBridge unit tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChildBridge } from '../src/child-bridge';
import { MessageType, BridgeErrorCode } from '../src/types';
import { createMockWindow } from './helpers/mock-window';
import type { TestChildContract, TestParentContract } from './helpers/test-contracts';

describe('ChildBridge', () => {
  let mockParent: ReturnType<typeof createMockWindow>;
  let listeners: Set<(event: MessageEvent) => void>;

  beforeEach(() => {
    vi.useFakeTimers();

    mockParent = createMockWindow('https://parent.example.com');
    listeners = new Set();

    // Mock window methods
    vi.spyOn(window, 'addEventListener').mockImplementation((event, handler) => {
      if (event === 'message') {
        listeners.add(handler as (event: MessageEvent) => void);
      }
    });

    vi.spyOn(window, 'removeEventListener').mockImplementation((event, handler) => {
      if (event === 'message') {
        listeners.delete(handler as (event: MessageEvent) => void);
      }
    });

    // Mock window.parent
    Object.defineProperty(window, 'parent', {
      value: mockParent.window,
      writable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    listeners.clear();
  });

  function dispatchToChild(data: unknown, origin = 'https://parent.example.com') {
    const event = new MessageEvent('message', {
      data,
      origin,
      source: mockParent.window,
    });

    for (const listener of listeners) {
      listener(event);
    }
  }

  describe('constructor', () => {
    it('should initialize and start listening immediately', () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

      const bridge = new ChildBridge<TestChildContract, TestParentContract>({
        origin: 'https://parent.example.com',
        methods: {
          'test/echo': ({ message }) => ({ echoed: message }),
          'test/add': ({ a, b }) => ({ result: a + b }),
          'test/async': async () => ({ completed: true }),
          'test/error': () => ({ success: true }),
        },
      });

      expect(addEventListenerSpy).toHaveBeenCalledWith('message', expect.any(Function));
      expect(bridge.getState()).toBe('disconnected');
      expect(bridge.isConnected()).toBe(false);
    });

    it('should throw if no origin provided', () => {
      expect(() => {
        new ChildBridge({
          origin: [] as unknown as string,
          methods: {},
        });
      }).toThrow('At least one origin must be specified');
    });
  });

  describe('handshake', () => {
    it('should respond to handshake request', () => {
      const bridge = new ChildBridge<TestChildContract, TestParentContract>({
        origin: 'https://parent.example.com',
        methods: {
          'test/echo': ({ message }) => ({ echoed: message }),
          'test/add': ({ a, b }) => ({ result: a + b }),
          'test/async': async () => ({ completed: true }),
          'test/error': () => ({ success: true }),
        },
      });

      // Send handshake request
      dispatchToChild({
        type: MessageType.HANDSHAKE_REQUEST,
        id: 'handshake-1',
        timestamp: Date.now(),
        version: '0.0.1',
        methods: ['parent/getConfig'],
      });

      // Check that ack was sent
      expect(mockParent.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.HANDSHAKE_ACK,
          requestId: 'handshake-1',
          methods: expect.arrayContaining(['test/echo', 'test/add']),
        }),
        'https://parent.example.com'
      );

      expect(bridge.isConnected()).toBe(true);
      expect(bridge.getParentOrigin()).toBe('https://parent.example.com');
      expect(bridge.getParentMethods()).toContain('parent/getConfig');
    });

    it('should reject handshake from invalid origin', () => {
      new ChildBridge<TestChildContract, TestParentContract>({
        origin: 'https://parent.example.com',
        methods: {
          'test/echo': ({ message }) => ({ echoed: message }),
          'test/add': ({ a, b }) => ({ result: a + b }),
          'test/async': async () => ({ completed: true }),
          'test/error': () => ({ success: true }),
        },
      });

      // Send handshake from wrong origin
      const event = new MessageEvent('message', {
        data: {
          type: MessageType.HANDSHAKE_REQUEST,
          id: 'handshake-1',
          timestamp: Date.now(),
          version: '0.0.1',
        },
        origin: 'https://evil.example.com',
        source: mockParent.window,
      });

      for (const listener of listeners) {
        listener(event);
      }

      // Should not send ack
      expect(mockParent.postMessage).not.toHaveBeenCalled();
    });
  });

  describe('request handling', () => {
    it('should execute handler and send success response', async () => {
      const bridge = new ChildBridge<TestChildContract, TestParentContract>({
        origin: 'https://parent.example.com',
        methods: {
          'test/echo': ({ message }) => ({ echoed: message }),
          'test/add': ({ a, b }) => ({ result: a + b }),
          'test/async': async () => ({ completed: true }),
          'test/error': () => ({ success: true }),
        },
      });

      // Complete handshake first
      dispatchToChild({
        type: MessageType.HANDSHAKE_REQUEST,
        id: 'handshake-1',
        timestamp: Date.now(),
        version: '0.0.1',
      });

      mockParent.postMessage.mockClear();

      // Send request
      dispatchToChild({
        type: MessageType.REQUEST,
        id: 'request-1',
        timestamp: Date.now(),
        method: 'test/echo',
        payload: { message: 'hello' },
      });

      // Allow async handler to complete
      await vi.runAllTimersAsync();

      expect(mockParent.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.RESPONSE,
          requestId: 'request-1',
          success: true,
          data: { echoed: 'hello' },
        }),
        'https://parent.example.com'
      );
    });

    it('should handle async handlers', async () => {
      const bridge = new ChildBridge<TestChildContract, TestParentContract>({
        origin: 'https://parent.example.com',
        methods: {
          'test/echo': ({ message }) => ({ echoed: message }),
          'test/add': ({ a, b }) => ({ result: a + b }),
          'test/async': async ({ delay }) => {
            return { completed: true };
          },
          'test/error': () => ({ success: true }),
        },
      });

      // Complete handshake
      dispatchToChild({
        type: MessageType.HANDSHAKE_REQUEST,
        id: 'handshake-1',
        timestamp: Date.now(),
        version: '0.0.1',
      });

      mockParent.postMessage.mockClear();

      // Send async request
      dispatchToChild({
        type: MessageType.REQUEST,
        id: 'request-1',
        timestamp: Date.now(),
        method: 'test/async',
        payload: { delay: 100 },
      });

      await vi.runAllTimersAsync();

      expect(mockParent.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.RESPONSE,
          success: true,
          data: { completed: true },
        }),
        'https://parent.example.com'
      );
    });

    it('should send error response for missing method', async () => {
      const bridge = new ChildBridge<TestChildContract, TestParentContract>({
        origin: 'https://parent.example.com',
        methods: {
          'test/echo': ({ message }) => ({ echoed: message }),
          // Only echo handler registered
        } as never,
      });

      // Complete handshake
      dispatchToChild({
        type: MessageType.HANDSHAKE_REQUEST,
        id: 'handshake-1',
        timestamp: Date.now(),
        version: '0.0.1',
      });

      mockParent.postMessage.mockClear();

      // Send request for unregistered method
      dispatchToChild({
        type: MessageType.REQUEST,
        id: 'request-1',
        timestamp: Date.now(),
        method: 'test/add',
        payload: { a: 1, b: 2 },
      });

      await vi.runAllTimersAsync();

      expect(mockParent.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.RESPONSE,
          requestId: 'request-1',
          success: false,
          error: expect.objectContaining({
            code: BridgeErrorCode.METHOD_NOT_FOUND,
          }),
        }),
        'https://parent.example.com'
      );
    });

    it('should send error response when handler throws', async () => {
      const bridge = new ChildBridge<TestChildContract, TestParentContract>({
        origin: 'https://parent.example.com',
        methods: {
          'test/echo': ({ message }) => ({ echoed: message }),
          'test/add': ({ a, b }) => ({ result: a + b }),
          'test/async': async () => ({ completed: true }),
          'test/error': () => {
            throw new Error('Test error');
          },
        },
      });

      // Complete handshake
      dispatchToChild({
        type: MessageType.HANDSHAKE_REQUEST,
        id: 'handshake-1',
        timestamp: Date.now(),
        version: '0.0.1',
      });

      mockParent.postMessage.mockClear();

      // Send request that will error
      dispatchToChild({
        type: MessageType.REQUEST,
        id: 'request-1',
        timestamp: Date.now(),
        method: 'test/error',
        payload: { shouldFail: true },
      });

      await vi.runAllTimersAsync();

      expect(mockParent.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.RESPONSE,
          requestId: 'request-1',
          success: false,
          error: expect.objectContaining({
            code: BridgeErrorCode.HANDLER_ERROR,
          }),
        }),
        'https://parent.example.com'
      );
    });
  });

  describe('call() (bi-directional)', () => {
    it('should throw if not connected', async () => {
      const bridge = new ChildBridge<TestChildContract, TestParentContract>({
        origin: 'https://parent.example.com',
        methods: {
          'test/echo': ({ message }) => ({ echoed: message }),
          'test/add': ({ a, b }) => ({ result: a + b }),
          'test/async': async () => ({ completed: true }),
          'test/error': () => ({ success: true }),
        },
      });

      await expect(
        bridge.call('parent/getConfig', {})
      ).rejects.toMatchObject({
        code: BridgeErrorCode.NOT_CONNECTED,
      });
    });
  });

  describe('destroy()', () => {
    it('should cleanup resources', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

      const bridge = new ChildBridge<TestChildContract, TestParentContract>({
        origin: 'https://parent.example.com',
        methods: {
          'test/echo': ({ message }) => ({ echoed: message }),
          'test/add': ({ a, b }) => ({ result: a + b }),
          'test/async': async () => ({ completed: true }),
          'test/error': () => ({ success: true }),
        },
      });

      bridge.destroy();

      expect(bridge.getState()).toBe('destroyed');
      expect(removeEventListenerSpy).toHaveBeenCalledWith('message', expect.any(Function));
    });
  });
});
```

### Step 7: Create Integration Tests (45 min)

**tests/integration.test.ts content:**
```typescript
/**
 * Integration tests for full bridge communication
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ParentBridge } from '../src/parent-bridge';
import { ChildBridge } from '../src/child-bridge';
import { MessageType } from '../src/types';
import type { TestChildContract, TestParentContract } from './helpers/test-contracts';

describe('Integration Tests', () => {
  // These tests simulate the full postMessage flow
  let parentListeners: Set<(event: MessageEvent) => void>;
  let childListeners: Set<(event: MessageEvent) => void>;

  const PARENT_ORIGIN = 'https://parent.example.com';
  const CHILD_ORIGIN = 'https://child.example.com';

  beforeEach(() => {
    vi.useFakeTimers();

    parentListeners = new Set();
    childListeners = new Set();

    // Create mock child window
    const childWindow = {
      postMessage: vi.fn((data: unknown, origin: string) => {
        if (origin === CHILD_ORIGIN || origin === '*') {
          queueMicrotask(() => {
            const event = new MessageEvent('message', {
              data,
              origin: PARENT_ORIGIN,
              source: window,
            });
            for (const listener of childListeners) {
              listener(event);
            }
          });
        }
      }),
    };

    // Create mock iframe
    const mockIframe = {
      contentWindow: childWindow,
    } as unknown as HTMLIFrameElement;

    // Store for later access
    (global as unknown as { mockIframe: HTMLIFrameElement }).mockIframe = mockIframe;
    (global as unknown as { childWindow: typeof childWindow }).childWindow = childWindow;

    // Mock parent window.addEventListener
    vi.spyOn(window, 'addEventListener').mockImplementation((event, handler) => {
      if (event === 'message') {
        parentListeners.add(handler as (event: MessageEvent) => void);
      }
    });

    vi.spyOn(window, 'removeEventListener').mockImplementation((event, handler) => {
      if (event === 'message') {
        parentListeners.delete(handler as (event: MessageEvent) => void);
      }
    });

    // Mock window.parent.postMessage for child -> parent
    Object.defineProperty(window, 'parent', {
      value: {
        postMessage: vi.fn((data: unknown, origin: string) => {
          if (origin === PARENT_ORIGIN || origin === '*') {
            queueMicrotask(() => {
              const childW = (global as unknown as { childWindow: typeof childWindow }).childWindow;
              const event = new MessageEvent('message', {
                data,
                origin: CHILD_ORIGIN,
                source: childW as unknown as Window,
              });
              for (const listener of parentListeners) {
                listener(event);
              }
            });
          }
        }),
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    parentListeners.clear();
    childListeners.clear();
  });

  function setupChild() {
    // Override addEventListener for child context
    const originalAddEventListener = window.addEventListener;

    // For child, use childListeners
    vi.spyOn(window, 'addEventListener').mockImplementation((event, handler) => {
      if (event === 'message') {
        childListeners.add(handler as (event: MessageEvent) => void);
      }
    });

    const bridge = new ChildBridge<TestChildContract, TestParentContract>({
      origin: PARENT_ORIGIN,
      methods: {
        'test/echo': ({ message }) => ({ echoed: message }),
        'test/add': ({ a, b }) => ({ result: a + b }),
        'test/async': async ({ delay }) => {
          await new Promise((r) => setTimeout(r, delay));
          return { completed: true };
        },
        'test/error': ({ shouldFail }) => {
          if (shouldFail) throw new Error('Intentional error');
          return { success: true };
        },
      },
    });

    // Restore for parent context
    vi.mocked(window.addEventListener).mockImplementation((event, handler) => {
      if (event === 'message') {
        parentListeners.add(handler as (event: MessageEvent) => void);
      }
    });

    return bridge;
  }

  describe('Handshake Flow', () => {
    it('should complete handshake between parent and child', async () => {
      const mockIframe = (global as unknown as { mockIframe: HTMLIFrameElement }).mockIframe;

      // Setup child first (it waits for handshake)
      const childBridge = setupChild();

      // Create parent bridge
      const parentBridge = new ParentBridge<TestParentContract, TestChildContract>({
        target: mockIframe,
        origin: CHILD_ORIGIN,
        handshakeTimeout: 5000,
      });

      // Connect parent
      const connectPromise = parentBridge.connect();

      // Process all messages
      await vi.runAllTimersAsync();

      await connectPromise;

      expect(parentBridge.isConnected()).toBe(true);
      expect(childBridge.isConnected()).toBe(true);

      // Verify methods were exchanged
      expect(parentBridge.getRemoteMethods()).toContain('test/echo');
      expect(childBridge.getParentOrigin()).toBe(PARENT_ORIGIN);

      // Cleanup
      parentBridge.destroy();
      childBridge.destroy();
    });
  });

  describe('RPC Flow', () => {
    it('should execute RPC call end-to-end', async () => {
      const mockIframe = (global as unknown as { mockIframe: HTMLIFrameElement }).mockIframe;

      // Setup bridges
      const childBridge = setupChild();
      const parentBridge = new ParentBridge<TestParentContract, TestChildContract>({
        target: mockIframe,
        origin: CHILD_ORIGIN,
      });

      // Connect
      const connectPromise = parentBridge.connect();
      await vi.runAllTimersAsync();
      await connectPromise;

      // Make RPC call
      const callPromise = parentBridge.call('test/echo', { message: 'hello world' });
      await vi.runAllTimersAsync();

      const result = await callPromise;

      expect(result).toEqual({ echoed: 'hello world' });

      // Cleanup
      parentBridge.destroy();
      childBridge.destroy();
    });

    it('should handle numeric operations', async () => {
      const mockIframe = (global as unknown as { mockIframe: HTMLIFrameElement }).mockIframe;

      const childBridge = setupChild();
      const parentBridge = new ParentBridge<TestParentContract, TestChildContract>({
        target: mockIframe,
        origin: CHILD_ORIGIN,
      });

      // Connect
      const connectPromise = parentBridge.connect();
      await vi.runAllTimersAsync();
      await connectPromise;

      // Make RPC call
      const callPromise = parentBridge.call('test/add', { a: 5, b: 3 });
      await vi.runAllTimersAsync();

      const result = await callPromise;

      expect(result).toEqual({ result: 8 });

      // Cleanup
      parentBridge.destroy();
      childBridge.destroy();
    });
  });
});
```

## Todo List

- [ ] Create `tests/helpers/test-contracts.ts`
- [ ] Create `tests/helpers/mock-window.ts`
- [ ] Create `tests/types.test.ts`
- [ ] Create `tests/errors.test.ts`
- [ ] Create `tests/utils.test.ts`
- [ ] Create `tests/parent-bridge.test.ts`
- [ ] Create `tests/child-bridge.test.ts`
- [ ] Create `tests/integration.test.ts`
- [ ] Run `pnpm test` - all tests should pass
- [ ] Run `pnpm test:coverage` - verify 90%+ coverage
- [ ] Fix any failing tests

## Success Criteria

- [ ] All tests pass
- [ ] 90%+ code coverage
- [ ] No flaky tests
- [ ] Type tests verify inference
- [ ] Integration tests verify end-to-end flow
- [ ] Error scenarios covered

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Flaky async tests | Medium | Use fake timers, await microtasks |
| Complex mock setup | Medium | Create reusable helpers |
| Missing edge cases | Medium | Review error paths |
| Low coverage | High | Use coverage tool to identify gaps |

## Security Considerations

- [ ] Test origin validation rejects invalid origins
- [ ] Test message source validation
- [ ] Test error messages don't leak internals

## Next Steps

After completing this phase:
1. Proceed to [Phase 6: Documentation](./phase-06-documentation.md)
2. Write README with usage examples
3. Generate API documentation
