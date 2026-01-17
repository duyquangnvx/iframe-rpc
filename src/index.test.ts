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
      initialize: async () => {},
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

    vi.spyOn(window, 'removeEventListener').mockImplementation(() => {});
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
});
