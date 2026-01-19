import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createParentBridge,
  createIframeBridge,
  RpcError,
  RpcTimeoutError,
  RpcMethodNotFoundError,
  MESSAGE_TYPE,
} from './index';

// Mock window and postMessage
const createMockWindow = () => ({
  postMessage: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
});

const createMockIframe = () => ({
  contentWindow: createMockWindow(),
});

describe('Error Classes', () => {
  describe('RpcError', () => {
    it('should create error with message', () => {
      const error = new RpcError('Test error');
      expect(error.message).toBe('Test error');
      expect(error.name).toBe('RpcError');
    });

    it('should create error with code', () => {
      const error = new RpcError('Test error', 'TEST_CODE');
      expect(error.code).toBe('TEST_CODE');
    });

    it('should create error with original stack', () => {
      const error = new RpcError('Test error', 'CODE', 'original stack');
      expect(error.originalStack).toBe('original stack');
    });
  });

  describe('RpcTimeoutError', () => {
    it('should create timeout error', () => {
      const error = new RpcTimeoutError('testMethod', 5000);
      expect(error.message).toBe('RPC call to "testMethod" timed out after 5000ms');
      expect(error.code).toBe('TIMEOUT');
      expect(error.name).toBe('RpcTimeoutError');
    });
  });

  describe('RpcMethodNotFoundError', () => {
    it('should create method not found error', () => {
      const error = new RpcMethodNotFoundError('unknownMethod');
      expect(error.message).toBe('Method "unknownMethod" not found');
      expect(error.code).toBe('METHOD_NOT_FOUND');
      expect(error.name).toBe('RpcMethodNotFoundError');
    });
  });
});

describe('MESSAGE_TYPE', () => {
  it('should have correct message types', () => {
    expect(MESSAGE_TYPE.REQUEST).toBe('iframe-rpc:request');
    expect(MESSAGE_TYPE.RESPONSE).toBe('iframe-rpc:response');
    expect(MESSAGE_TYPE.ERROR).toBe('iframe-rpc:error');
    expect(MESSAGE_TYPE.FIRE_AND_FORGET).toBe('iframe-rpc:fire-and-forget');
  });
});

describe('createParentBridge', () => {
  let mockIframe: ReturnType<typeof createMockIframe>;
  let originalWindow: typeof globalThis.window;
  let messageListeners: ((event: MessageEvent) => void)[];

  beforeEach(() => {
    mockIframe = createMockIframe();
    messageListeners = [];
    originalWindow = globalThis.window;

    // Mock window.addEventListener
    vi.spyOn(window, 'addEventListener').mockImplementation((type, listener) => {
      if (type === 'message') {
        messageListeners.push(listener as (event: MessageEvent) => void);
      }
    });

    vi.spyOn(window, 'removeEventListener').mockImplementation((type, listener) => {
      if (type === 'message') {
        const idx = messageListeners.indexOf(listener as (event: MessageEvent) => void);
        if (idx !== -1) messageListeners.splice(idx, 1);
      }
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.window = originalWindow;
  });

  it('should throw if iframe contentWindow is not available', () => {
    const badIframe = { contentWindow: null } as HTMLIFrameElement;
    expect(() => createParentBridge(badIframe, {})).toThrow(
      'Iframe contentWindow is not available'
    );
  });

  it('should create bridge with handlers', () => {
    const handlers = {
      getData: async () => 'test data',
    };

    const bridge = createParentBridge(
      mockIframe as unknown as HTMLIFrameElement,
      handlers
    );

    expect(bridge).toBeDefined();
    expect(bridge.call).toBeDefined();
    expect(bridge.notify).toBeDefined();
    expect(bridge.destroy).toBeDefined();
    expect(bridge.isActive).toBeDefined();
    expect(bridge.isActive()).toBe(true);
  });

  it('should register message listener', () => {
    createParentBridge(mockIframe as unknown as HTMLIFrameElement, {});
    expect(window.addEventListener).toHaveBeenCalledWith('message', expect.any(Function));
  });

  it('should destroy bridge and clean up', () => {
    const bridge = createParentBridge(mockIframe as unknown as HTMLIFrameElement, {});

    expect(bridge.isActive()).toBe(true);
    bridge.destroy();
    expect(bridge.isActive()).toBe(false);
    expect(window.removeEventListener).toHaveBeenCalledWith('message', expect.any(Function));
  });

  it('should call remote method and wait for response', async () => {
    type RemoteMethods = {
      getStatus: () => Promise<string>;
    };

    const bridge = createParentBridge<Record<string, never>, RemoteMethods>(
      mockIframe as unknown as HTMLIFrameElement,
      {}
    );

    // Capture the sent message
    let sentMessage: any;
    (mockIframe.contentWindow.postMessage as any).mockImplementation((msg: any) => {
      sentMessage = msg;
    });

    // Start the call
    const resultPromise = bridge.call.getStatus();

    // Simulate response
    await new Promise((r) => setTimeout(r, 10));

    const responseEvent = new MessageEvent('message', {
      data: {
        __iframeRpc: true,
        type: MESSAGE_TYPE.RESPONSE,
        channel: 'default',
        id: sentMessage.id,
        result: 'ready',
      },
      source: mockIframe.contentWindow as unknown as Window,
    });

    messageListeners.forEach((l) => l(responseEvent));

    const result = await resultPromise;
    expect(result).toBe('ready');
  });

  it('should handle error responses', async () => {
    type RemoteMethods = {
      failingMethod: () => Promise<string>;
    };

    const bridge = createParentBridge<Record<string, never>, RemoteMethods>(
      mockIframe as unknown as HTMLIFrameElement,
      {}
    );

    let sentMessage: any;
    (mockIframe.contentWindow.postMessage as any).mockImplementation((msg: any) => {
      sentMessage = msg;
    });

    const resultPromise = bridge.call.failingMethod();

    await new Promise((r) => setTimeout(r, 10));

    const errorEvent = new MessageEvent('message', {
      data: {
        __iframeRpc: true,
        type: MESSAGE_TYPE.ERROR,
        channel: 'default',
        id: sentMessage.id,
        error: {
          message: 'Something went wrong',
          code: 'CUSTOM_ERROR',
        },
      },
      source: mockIframe.contentWindow as unknown as Window,
    });

    messageListeners.forEach((l) => l(errorEvent));

    await expect(resultPromise).rejects.toThrow('Something went wrong');
  });

  it('should timeout after specified duration', async () => {
    vi.useFakeTimers();

    type RemoteMethods = {
      slowMethod: () => Promise<string>;
    };

    const bridge = createParentBridge<Record<string, never>, RemoteMethods>(
      mockIframe as unknown as HTMLIFrameElement,
      {},
      { timeout: 100 }
    );

    const resultPromise = bridge.call.slowMethod();

    // Advance time past timeout
    vi.advanceTimersByTime(150);

    await expect(resultPromise).rejects.toThrow(RpcTimeoutError);

    vi.useRealTimers();
  });

  it('should reject calls after bridge is destroyed', async () => {
    type RemoteMethods = {
      testMethod: () => Promise<string>;
    };

    const bridge = createParentBridge<Record<string, never>, RemoteMethods>(
      mockIframe as unknown as HTMLIFrameElement,
      {}
    );

    bridge.destroy();

    await expect(bridge.call.testMethod()).rejects.toThrow('Bridge has been destroyed');
  });

  it('should call remote method using invoke', async () => {
    type RemoteMethods = {
      getUser: (id: string) => Promise<{ name: string }>;
    };

    const bridge = createParentBridge<Record<string, never>, RemoteMethods>(
      mockIframe as unknown as HTMLIFrameElement,
      {}
    );

    let sentMessage: any;
    (mockIframe.contentWindow.postMessage as any).mockImplementation((msg: any) => {
      sentMessage = msg;
    });

    const resultPromise = bridge.invoke('getUser', '123');

    await new Promise((r) => setTimeout(r, 10));

    const responseEvent = new MessageEvent('message', {
      data: {
        __iframeRpc: true,
        type: MESSAGE_TYPE.RESPONSE,
        channel: 'default',
        id: sentMessage.id,
        result: { name: 'John' },
      },
      source: mockIframe.contentWindow as unknown as Window,
    });

    messageListeners.forEach((l) => l(responseEvent));

    const result = await resultPromise;
    expect(result).toEqual({ name: 'John' });
  });

  it('should reject invoke after bridge is destroyed', async () => {
    type RemoteMethods = {
      testMethod: () => Promise<string>;
    };

    const bridge = createParentBridge<Record<string, never>, RemoteMethods>(
      mockIframe as unknown as HTMLIFrameElement,
      {}
    );

    bridge.destroy();

    await expect(bridge.invoke('testMethod')).rejects.toThrow('Bridge has been destroyed');
  });

  it('should send fire-and-forget messages', () => {
    type RemoteMethods = {
      logEvent: (event: string) => void;
    };

    const bridge = createParentBridge<Record<string, never>, RemoteMethods>(
      mockIframe as unknown as HTMLIFrameElement,
      {}
    );

    bridge.notify('logEvent', 'test-event');

    expect(mockIframe.contentWindow.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        __iframeRpc: true,
        type: MESSAGE_TYPE.FIRE_AND_FORGET,
        method: 'logEvent',
        args: ['test-event'],
      }),
      '*'
    );
  });

  it('should handle incoming requests', async () => {
    const handlers = {
      getData: vi.fn().mockResolvedValue('response data'),
    };

    createParentBridge(mockIframe as unknown as HTMLIFrameElement, handlers);

    const requestEvent = new MessageEvent('message', {
      data: {
        __iframeRpc: true,
        type: MESSAGE_TYPE.REQUEST,
        channel: 'default',
        id: 'test-id',
        method: 'getData',
        args: [],
      },
      source: mockIframe.contentWindow as unknown as Window,
    });

    messageListeners.forEach((l) => l(requestEvent));

    await new Promise((r) => setTimeout(r, 10));

    expect(handlers.getData).toHaveBeenCalled();
  });

  it('should use custom channel', () => {
    type RemoteMethods = {
      test: () => Promise<void>;
    };

    const bridge = createParentBridge<Record<string, never>, RemoteMethods>(
      mockIframe as unknown as HTMLIFrameElement,
      {},
      { channel: 'custom-channel' }
    );

    bridge.call.test();

    expect(mockIframe.contentWindow.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'custom-channel',
      }),
      '*'
    );
  });

  it('should use custom targetOrigin', () => {
    type RemoteMethods = {
      test: () => Promise<void>;
    };

    const bridge = createParentBridge<Record<string, never>, RemoteMethods>(
      mockIframe as unknown as HTMLIFrameElement,
      {},
      { targetOrigin: 'https://example.com' }
    );

    bridge.call.test();

    expect(mockIframe.contentWindow.postMessage).toHaveBeenCalledWith(
      expect.any(Object),
      'https://example.com'
    );
  });
});

describe('createIframeBridge', () => {
  let originalParent: typeof window.parent;

  beforeEach(() => {
    originalParent = window.parent;
    // Mock that we're in an iframe
    Object.defineProperty(window, 'parent', {
      value: createMockWindow(),
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'parent', {
      value: originalParent,
      writable: true,
      configurable: true,
    });
  });

  it('should throw if not in iframe', () => {
    // Restore parent to window itself
    Object.defineProperty(window, 'parent', {
      value: window,
      writable: true,
      configurable: true,
    });

    expect(() => createIframeBridge({})).toThrow('Not running inside an iframe');
  });

  it('should create bridge when in iframe', () => {
    const handlers = {
      initialize: async () => { },
    };

    const bridge = createIframeBridge(handlers);

    expect(bridge).toBeDefined();
    expect(bridge.call).toBeDefined();
    expect(bridge.notify).toBeDefined();
    expect(bridge.destroy).toBeDefined();
    expect(bridge.isActive()).toBe(true);
  });
});

describe('Message Filtering', () => {
  let mockIframe: ReturnType<typeof createMockIframe>;
  let messageListeners: ((event: MessageEvent) => void)[];

  beforeEach(() => {
    mockIframe = createMockIframe();
    messageListeners = [];

    vi.spyOn(window, 'addEventListener').mockImplementation((type, listener) => {
      if (type === 'message') {
        messageListeners.push(listener as (event: MessageEvent) => void);
      }
    });

    vi.spyOn(window, 'removeEventListener').mockImplementation(() => { });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should ignore non-RPC messages', () => {
    const handlers = {
      test: vi.fn(),
    };

    createParentBridge(mockIframe as unknown as HTMLIFrameElement, handlers);

    // Send a non-RPC message
    const nonRpcEvent = new MessageEvent('message', {
      data: { someOtherData: true },
    });

    messageListeners.forEach((l) => l(nonRpcEvent));

    expect(handlers.test).not.toHaveBeenCalled();
  });

  it('should ignore messages from different channel', () => {
    const handlers = {
      test: vi.fn(),
    };

    createParentBridge(
      mockIframe as unknown as HTMLIFrameElement,
      handlers,
      { channel: 'channel-a' }
    );

    // Send message on different channel
    const differentChannelEvent = new MessageEvent('message', {
      data: {
        __iframeRpc: true,
        type: MESSAGE_TYPE.REQUEST,
        channel: 'channel-b',
        id: 'test',
        method: 'test',
        args: [],
      },
      source: mockIframe.contentWindow as unknown as Window,
    });

    messageListeners.forEach((l) => l(differentChannelEvent));

    expect(handlers.test).not.toHaveBeenCalled();
  });

  it('should not process messages after destroy', () => {
    const handlers = {
      test: vi.fn(),
    };

    const bridge = createParentBridge(mockIframe as unknown as HTMLIFrameElement, handlers);

    bridge.destroy();

    const event = new MessageEvent('message', {
      data: {
        __iframeRpc: true,
        type: MESSAGE_TYPE.REQUEST,
        channel: 'default',
        id: 'test',
        method: 'test',
        args: [],
      },
      source: mockIframe.contentWindow as unknown as Window,
    });

    messageListeners.forEach((l) => l(event));

    expect(handlers.test).not.toHaveBeenCalled();
  });

  it('should reject messages from untrusted origin when targetOrigin is specified', () => {
    const handlers = {
      test: vi.fn(),
    };

    createParentBridge(
      mockIframe as unknown as HTMLIFrameElement,
      handlers,
      { targetOrigin: 'https://trusted.com' }
    );

    // Send message from different origin
    const untrustedEvent = new MessageEvent('message', {
      data: {
        __iframeRpc: true,
        type: MESSAGE_TYPE.REQUEST,
        channel: 'default',
        id: 'test',
        method: 'test',
        args: [],
      },
      source: mockIframe.contentWindow as unknown as Window,
    });
    // Override origin for test
    Object.defineProperty(untrustedEvent, 'origin', { value: 'https://untrusted.com' });

    messageListeners.forEach((l) => l(untrustedEvent));

    expect(handlers.test).not.toHaveBeenCalled();
  });

  it('should accept messages from trusted origin when targetOrigin is specified', async () => {
    const handlers = {
      test: vi.fn().mockResolvedValue('success'),
    };

    createParentBridge(
      mockIframe as unknown as HTMLIFrameElement,
      handlers,
      { targetOrigin: 'https://trusted.com' }
    );

    // Send message from trusted origin
    const trustedEvent = new MessageEvent('message', {
      data: {
        __iframeRpc: true,
        type: MESSAGE_TYPE.REQUEST,
        channel: 'default',
        id: 'test',
        method: 'test',
        args: [],
      },
      source: mockIframe.contentWindow as unknown as Window,
    });
    Object.defineProperty(trustedEvent, 'origin', { value: 'https://trusted.com' });

    messageListeners.forEach((l) => l(trustedEvent));

    await new Promise((r) => setTimeout(r, 10));

    expect(handlers.test).toHaveBeenCalled();
  });

  it('should accept messages from any origin when targetOrigin is wildcard', () => {
    const handlers = {
      test: vi.fn(),
    };

    createParentBridge(
      mockIframe as unknown as HTMLIFrameElement,
      handlers,
      { targetOrigin: '*' }
    );

    // Send message from any origin
    const anyOriginEvent = new MessageEvent('message', {
      data: {
        __iframeRpc: true,
        type: MESSAGE_TYPE.REQUEST,
        channel: 'default',
        id: 'test',
        method: 'test',
        args: [],
      },
      source: mockIframe.contentWindow as unknown as Window,
    });
    Object.defineProperty(anyOriginEvent, 'origin', { value: 'https://random-site.com' });

    messageListeners.forEach((l) => l(anyOriginEvent));

    expect(handlers.test).toHaveBeenCalled();
  });

  it('should ignore messages with invalid type field', () => {
    const handlers = {
      test: vi.fn(),
    };

    createParentBridge(mockIframe as unknown as HTMLIFrameElement, handlers);

    // Send message with invalid type
    const invalidTypeEvent = new MessageEvent('message', {
      data: {
        __iframeRpc: true,
        type: 'invalid-type',
        channel: 'default',
        id: 'test',
        method: 'test',
        args: [],
      },
      source: mockIframe.contentWindow as unknown as Window,
    });

    messageListeners.forEach((l) => l(invalidTypeEvent));

    expect(handlers.test).not.toHaveBeenCalled();
  });
});

describe('Retry Mechanism', () => {
  let mockIframe: ReturnType<typeof createMockIframe>;
  let messageListeners: ((event: MessageEvent) => void)[];

  beforeEach(() => {
    mockIframe = createMockIframe();
    messageListeners = [];

    vi.spyOn(window, 'addEventListener').mockImplementation((type, listener) => {
      if (type === 'message') {
        messageListeners.push(listener as (event: MessageEvent) => void);
      }
    });

    vi.spyOn(window, 'removeEventListener').mockImplementation(() => { });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should not retry when maxRetries is 0 (default)', async () => {
    vi.useFakeTimers();

    type RemoteMethods = {
      testMethod: () => Promise<string>;
    };

    const bridge = createParentBridge<Record<string, never>, RemoteMethods>(
      mockIframe as unknown as HTMLIFrameElement,
      {},
      { timeout: 100 }
    );

    const resultPromise = bridge.call.testMethod();

    // Advance time past timeout
    vi.advanceTimersByTime(150);

    await expect(resultPromise).rejects.toThrow(RpcTimeoutError);
    // Should only have one postMessage call (no retries)
    expect(mockIframe.contentWindow.postMessage).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('should retry on timeout when maxRetries > 0', async () => {
    vi.useFakeTimers();

    type RemoteMethods = {
      testMethod: () => Promise<string>;
    };

    const bridge = createParentBridge<Record<string, never>, RemoteMethods>(
      mockIframe as unknown as HTMLIFrameElement,
      {},
      {
        timeout: 100,
        retry: {
          maxRetries: 2,
          retryDelay: 50,
          retryBackoff: 1, // No backoff for easier testing
        },
      }
    );

    const resultPromise = bridge.call.testMethod();

    // First attempt times out
    vi.advanceTimersByTime(150);
    await Promise.resolve(); // Allow microtasks

    // Wait for first retry delay
    vi.advanceTimersByTime(50);
    await Promise.resolve();

    // Second attempt times out
    vi.advanceTimersByTime(150);
    await Promise.resolve();

    // Wait for second retry delay
    vi.advanceTimersByTime(50);
    await Promise.resolve();

    // Third attempt (last) times out
    vi.advanceTimersByTime(150);
    await Promise.resolve();

    // All retries exhausted
    await expect(resultPromise).rejects.toThrow(RpcTimeoutError);

    // Should have 3 postMessage calls (1 initial + 2 retries)
    expect(mockIframe.contentWindow.postMessage).toHaveBeenCalledTimes(3);

    vi.useRealTimers();
  });

  it('should succeed on retry if response arrives', async () => {
    vi.useFakeTimers();

    type RemoteMethods = {
      testMethod: () => Promise<string>;
    };

    const sentMessages: any[] = [];
    (mockIframe.contentWindow.postMessage as any).mockImplementation((msg: any) => {
      sentMessages.push(msg);
    });

    const bridge = createParentBridge<Record<string, never>, RemoteMethods>(
      mockIframe as unknown as HTMLIFrameElement,
      {},
      {
        timeout: 100,
        retry: {
          maxRetries: 2,
          retryDelay: 50,
          retryBackoff: 1,
        },
      }
    );

    const resultPromise = bridge.call.testMethod();

    // First attempt times out
    vi.advanceTimersByTime(150);
    await Promise.resolve();

    // Wait for retry delay
    vi.advanceTimersByTime(50);
    await Promise.resolve();

    // Second attempt - simulate successful response
    const secondMessage = sentMessages[1];
    const responseEvent = new MessageEvent('message', {
      data: {
        __iframeRpc: true,
        type: MESSAGE_TYPE.RESPONSE,
        channel: 'default',
        id: secondMessage.id,
        result: 'success',
      },
      source: mockIframe.contentWindow as unknown as Window,
    });

    messageListeners.forEach((l) => l(responseEvent));

    const result = await resultPromise;
    expect(result).toBe('success');
    expect(mockIframe.contentWindow.postMessage).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it('should use exponential backoff for retry delays', async () => {
    vi.useFakeTimers();

    type RemoteMethods = {
      testMethod: () => Promise<string>;
    };

    const bridge = createParentBridge<Record<string, never>, RemoteMethods>(
      mockIframe as unknown as HTMLIFrameElement,
      {},
      {
        timeout: 50,
        retry: {
          maxRetries: 3,
          retryDelay: 100,
          retryBackoff: 2,
          maxRetryDelay: 1000,
        },
      }
    );

    const resultPromise = bridge.call.testMethod();

    // First attempt times out at 50ms
    vi.advanceTimersByTime(50);
    await Promise.resolve();
    expect(mockIframe.contentWindow.postMessage).toHaveBeenCalledTimes(1);

    // First retry delay: 100ms * 2^0 = 100ms
    vi.advanceTimersByTime(100);
    await Promise.resolve();
    expect(mockIframe.contentWindow.postMessage).toHaveBeenCalledTimes(2);

    // Second attempt times out
    vi.advanceTimersByTime(50);
    await Promise.resolve();

    // Second retry delay: 100ms * 2^1 = 200ms
    vi.advanceTimersByTime(200);
    await Promise.resolve();
    expect(mockIframe.contentWindow.postMessage).toHaveBeenCalledTimes(3);

    // Third attempt times out
    vi.advanceTimersByTime(50);
    await Promise.resolve();

    // Third retry delay: 100ms * 2^2 = 400ms
    vi.advanceTimersByTime(400);
    await Promise.resolve();
    expect(mockIframe.contentWindow.postMessage).toHaveBeenCalledTimes(4);

    // Final attempt times out
    vi.advanceTimersByTime(50);
    await Promise.resolve();

    await expect(resultPromise).rejects.toThrow(RpcTimeoutError);

    vi.useRealTimers();
  });

  it('should respect maxRetryDelay cap', async () => {
    vi.useFakeTimers();

    type RemoteMethods = {
      testMethod: () => Promise<string>;
    };

    const bridge = createParentBridge<Record<string, never>, RemoteMethods>(
      mockIframe as unknown as HTMLIFrameElement,
      {},
      {
        timeout: 50,
        retry: {
          maxRetries: 2,
          retryDelay: 100,
          retryBackoff: 10, // Would be 1000ms on second retry, but capped
          maxRetryDelay: 200,
        },
      }
    );

    const resultPromise = bridge.call.testMethod();

    // First timeout
    vi.advanceTimersByTime(50);
    await Promise.resolve();

    // First retry delay: min(100 * 10^0, 200) = 100ms
    vi.advanceTimersByTime(100);
    await Promise.resolve();

    // Second timeout
    vi.advanceTimersByTime(50);
    await Promise.resolve();

    // Second retry delay: min(100 * 10^1, 200) = 200ms (capped)
    vi.advanceTimersByTime(200);
    await Promise.resolve();

    // Third timeout (final attempt)
    vi.advanceTimersByTime(50);

    await expect(resultPromise).rejects.toThrow(RpcTimeoutError);

    vi.useRealTimers();
  });

  it('should not retry non-retryable errors by default', async () => {
    vi.useFakeTimers();

    type RemoteMethods = {
      testMethod: () => Promise<string>;
    };

    let sentMessage: any;
    (mockIframe.contentWindow.postMessage as any).mockImplementation((msg: any) => {
      sentMessage = msg;
    });

    const bridge = createParentBridge<Record<string, never>, RemoteMethods>(
      mockIframe as unknown as HTMLIFrameElement,
      {},
      {
        retry: {
          maxRetries: 2,
          retryDelay: 50,
        },
      }
    );

    const resultPromise = bridge.call.testMethod();
    await vi.advanceTimersByTimeAsync(10);

    // Simulate an error response (not a timeout - should not be retried by default)
    const errorEvent = new MessageEvent('message', {
      data: {
        __iframeRpc: true,
        type: MESSAGE_TYPE.ERROR,
        channel: 'default',
        id: sentMessage.id,
        error: {
          message: 'Server error',
          code: 'SERVER_ERROR',
        },
      },
      source: mockIframe.contentWindow as unknown as Window,
    });

    messageListeners.forEach((l) => l(errorEvent));

    await expect(resultPromise).rejects.toThrow('Server error');
    // Should only have 1 call - no retries for non-timeout errors
    expect(mockIframe.contentWindow.postMessage).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('should use custom isRetryable function', async () => {
    vi.useFakeTimers();

    type RemoteMethods = {
      testMethod: () => Promise<string>;
    };

    const sentMessages: any[] = [];
    (mockIframe.contentWindow.postMessage as any).mockImplementation((msg: any) => {
      sentMessages.push(msg);
    });

    const bridge = createParentBridge<Record<string, never>, RemoteMethods>(
      mockIframe as unknown as HTMLIFrameElement,
      {},
      {
        retry: {
          maxRetries: 2,
          retryDelay: 50,
          retryBackoff: 1,
          // Custom: retry on any RpcError
          isRetryable: (error) => error instanceof RpcError,
        },
      }
    );

    const resultPromise = bridge.call.testMethod();
    await vi.advanceTimersByTimeAsync(10);

    // First attempt - error response
    const errorEvent1 = new MessageEvent('message', {
      data: {
        __iframeRpc: true,
        type: MESSAGE_TYPE.ERROR,
        channel: 'default',
        id: sentMessages[0].id,
        error: { message: 'Temporary error', code: 'TEMP_ERROR' },
      },
      source: mockIframe.contentWindow as unknown as Window,
    });
    messageListeners.forEach((l) => l(errorEvent1));

    // Wait for retry delay
    await vi.advanceTimersByTimeAsync(50);

    // Second attempt - success
    const responseEvent = new MessageEvent('message', {
      data: {
        __iframeRpc: true,
        type: MESSAGE_TYPE.RESPONSE,
        channel: 'default',
        id: sentMessages[1].id,
        result: 'success after retry',
      },
      source: mockIframe.contentWindow as unknown as Window,
    });
    messageListeners.forEach((l) => l(responseEvent));

    const result = await resultPromise;
    expect(result).toBe('success after retry');
    expect(mockIframe.contentWindow.postMessage).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it('should abort retry if bridge is destroyed during delay', async () => {
    vi.useFakeTimers();

    type RemoteMethods = {
      testMethod: () => Promise<string>;
    };

    const bridge = createParentBridge<Record<string, never>, RemoteMethods>(
      mockIframe as unknown as HTMLIFrameElement,
      {},
      {
        timeout: 50,
        retry: {
          maxRetries: 2,
          retryDelay: 100,
          retryBackoff: 1,
        },
      }
    );

    const resultPromise = bridge.call.testMethod();

    // First timeout
    vi.advanceTimersByTime(50);
    await Promise.resolve();

    // Destroy bridge during retry delay
    vi.advanceTimersByTime(50); // Halfway through delay
    bridge.destroy();
    vi.advanceTimersByTime(50); // Complete delay

    await expect(resultPromise).rejects.toThrow('Bridge has been destroyed');

    vi.useRealTimers();
  });
});
