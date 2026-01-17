/**
 * Integration tests for ParentBridge and ChildBridge communication
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type BridgeContract,
  BridgeErrorCode,
  ChildBridge,
  MessageType,
  ParentBridge,
} from "../src";

// Define test contract
interface TestContract extends BridgeContract {
  "math/add": { request: { a: number; b: number }; response: { result: number } };
  "user/get": { request: { id: string }; response: { id: string; name: string } };
  "error/throw": { request: Record<string, never>; response: never };
}

interface ParentContract extends BridgeContract {
  "parent/ping": { request: Record<string, never>; response: { pong: boolean } };
}

describe("ParentBridge", () => {
  describe("constructor", () => {
    it("should create instance with default state disconnected", () => {
      const mockIframe = {
        contentWindow: { postMessage: vi.fn() },
      } as unknown as HTMLIFrameElement;

      const bridge = new ParentBridge({
        target: mockIframe,
        origin: "https://child.example.com",
      });

      expect(bridge).toBeInstanceOf(ParentBridge);
      expect(bridge.getState()).toBe("disconnected");
      expect(bridge.isConnected()).toBe(false);
    });

    it("should accept Window target", () => {
      const mockWindow = { postMessage: vi.fn() } as unknown as Window;

      const bridge = new ParentBridge({
        target: mockWindow,
        origin: "https://child.example.com",
      });

      expect(bridge).toBeInstanceOf(ParentBridge);
    });

    it("should accept array of origins", () => {
      const mockIframe = {
        contentWindow: { postMessage: vi.fn() },
      } as unknown as HTMLIFrameElement;

      const bridge = new ParentBridge({
        target: mockIframe,
        origin: ["https://child1.example.com", "https://child2.example.com"],
      });

      expect(bridge).toBeInstanceOf(ParentBridge);
    });

    it("should throw if no origin specified", () => {
      const mockIframe = {
        contentWindow: { postMessage: vi.fn() },
      } as unknown as HTMLIFrameElement;

      expect(
        () =>
          new ParentBridge({
            target: mockIframe,
            origin: [] as unknown as string,
          }),
      ).toThrow("At least one origin must be specified");
    });

    it("should warn when using * origin", () => {
      const mockIframe = {
        contentWindow: { postMessage: vi.fn() },
      } as unknown as HTMLIFrameElement;
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      new ParentBridge({
        target: mockIframe,
        origin: "*",
      });

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("insecure"));
      warnSpy.mockRestore();
    });
  });

  describe("connect", () => {
    it("should fail if iframe contentWindow is null", async () => {
      // Create a mock that properly triggers the contentWindow null error path
      // (In happy-dom, detached iframes may still have contentWindow, so we use Object.create)
      const nullIframe = Object.create(HTMLIFrameElement.prototype, {
        contentWindow: { value: null, writable: false },
      });

      const bridge = new ParentBridge({
        target: nullIframe,
        origin: "https://child.example.com",
        handshakeRetries: 1,
        handshakeTimeout: 100,
      });

      await expect(bridge.connect()).rejects.toThrow("Iframe contentWindow is not available");
    });
  });

  describe("call without connection", () => {
    it("should reject if not connected", async () => {
      const mockIframe = {
        contentWindow: { postMessage: vi.fn() },
      } as unknown as HTMLIFrameElement;

      const bridge = new ParentBridge<Record<string, never>, TestContract>({
        target: mockIframe,
        origin: "https://child.example.com",
      });

      await expect(bridge.call("math/add", { a: 1, b: 2 })).rejects.toMatchObject({
        code: BridgeErrorCode.NOT_CONNECTED,
      });
    });
  });

  describe("destroy", () => {
    it("should set state to destroyed", () => {
      const mockIframe = {
        contentWindow: { postMessage: vi.fn() },
      } as unknown as HTMLIFrameElement;

      const bridge = new ParentBridge({
        target: mockIframe,
        origin: "https://child.example.com",
      });

      bridge.destroy();
      expect(bridge.getState()).toBe("destroyed");
    });

    it("should throw DESTROYED error when connect called after destroy", async () => {
      const mockIframe = {
        contentWindow: { postMessage: vi.fn() },
      } as unknown as HTMLIFrameElement;

      const bridge = new ParentBridge({
        target: mockIframe,
        origin: "https://child.example.com",
      });

      bridge.destroy();

      await expect(bridge.connect()).rejects.toMatchObject({
        code: BridgeErrorCode.DESTROYED,
      });
    });

    it("should be idempotent", () => {
      const mockIframe = {
        contentWindow: { postMessage: vi.fn() },
      } as unknown as HTMLIFrameElement;

      const bridge = new ParentBridge({
        target: mockIframe,
        origin: "https://child.example.com",
      });

      bridge.destroy();
      bridge.destroy(); // Should not throw
      expect(bridge.getState()).toBe("destroyed");
    });
  });

  describe("getRemoteMethods", () => {
    it("should return empty array before connection", () => {
      const mockIframe = {
        contentWindow: { postMessage: vi.fn() },
      } as unknown as HTMLIFrameElement;

      const bridge = new ParentBridge({
        target: mockIframe,
        origin: "https://child.example.com",
      });

      expect(bridge.getRemoteMethods()).toEqual([]);
    });
  });
});

describe("ChildBridge", () => {
  let messageHandler: ((event: MessageEvent) => void) | null = null;
  let parentPostMessage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    parentPostMessage = vi.fn();

    // Mock window.parent
    Object.defineProperty(window, "parent", {
      value: {
        postMessage: parentPostMessage,
      },
      writable: true,
      configurable: true,
    });

    // Capture message handlers
    vi.spyOn(window, "addEventListener").mockImplementation((type, handler) => {
      if (type === "message") {
        messageHandler = handler as (event: MessageEvent) => void;
      }
    });

    vi.spyOn(window, "removeEventListener").mockImplementation(() => {});
  });

  afterEach(() => {
    messageHandler = null;
    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("should create instance and start listening", () => {
      const bridge = new ChildBridge<TestContract, Record<string, never>>({
        origin: "https://parent.example.com",
        methods: {
          "math/add": ({ a, b }) => ({ result: a + b }),
        },
      });

      expect(bridge).toBeInstanceOf(ChildBridge);
      expect(bridge.getState()).toBe("disconnected");
      expect(window.addEventListener).toHaveBeenCalledWith("message", expect.any(Function));
    });

    it("should accept array of origins", () => {
      const bridge = new ChildBridge<TestContract, Record<string, never>>({
        origin: ["https://parent1.example.com", "https://parent2.example.com"],
        methods: {},
      });

      expect(bridge).toBeInstanceOf(ChildBridge);
    });

    it("should warn when using * origin", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      new ChildBridge<TestContract, Record<string, never>>({
        origin: "*",
        methods: {},
      });

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("insecure"));
    });
  });

  describe("handshake", () => {
    it("should respond to handshake request", () => {
      const bridge = new ChildBridge<TestContract, Record<string, never>>({
        origin: "https://parent.example.com",
        methods: {
          "math/add": ({ a, b }) => ({ result: a + b }),
        },
      });

      // Simulate handshake request
      if (messageHandler) {
        messageHandler(
          new MessageEvent("message", {
            origin: "https://parent.example.com",
            source: window.parent,
            data: {
              type: MessageType.HANDSHAKE_REQUEST,
              id: "hs-1",
              timestamp: Date.now(),
              version: "0.0.1",
              methods: ["parent/ping"],
            },
          }),
        );
      }

      expect(bridge.isConnected()).toBe(true);
      expect(bridge.getState()).toBe("connected");
      expect(parentPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.HANDSHAKE_ACK,
          methods: expect.arrayContaining(["math/add"]),
        }),
        "https://parent.example.com",
      );
    });

    it("should store parent methods", () => {
      const bridge = new ChildBridge<TestContract, ParentContract>({
        origin: "https://parent.example.com",
        methods: {},
      });

      if (messageHandler) {
        messageHandler(
          new MessageEvent("message", {
            origin: "https://parent.example.com",
            source: window.parent,
            data: {
              type: MessageType.HANDSHAKE_REQUEST,
              id: "hs-1",
              timestamp: Date.now(),
              version: "0.0.1",
              methods: ["parent/ping"],
            },
          }),
        );
      }

      expect(bridge.getParentMethods()).toEqual(["parent/ping"]);
    });

    it("should reject handshake from invalid origin", () => {
      new ChildBridge<TestContract, Record<string, never>>({
        origin: "https://trusted.example.com",
        methods: {},
      });

      // Try handshake from wrong origin
      if (messageHandler) {
        messageHandler(
          new MessageEvent("message", {
            origin: "https://evil.example.com",
            source: window.parent,
            data: {
              type: MessageType.HANDSHAKE_REQUEST,
              id: "hs-1",
              timestamp: Date.now(),
              version: "0.0.1",
            },
          }),
        );
      }

      // Should not respond
      expect(parentPostMessage).not.toHaveBeenCalled();
    });
  });

  describe("request handling", () => {
    it("should handle incoming request and send success response", async () => {
      new ChildBridge<TestContract, Record<string, never>>({
        origin: "https://parent.example.com",
        methods: {
          "math/add": ({ a, b }) => ({ result: a + b }),
        },
      });

      // Connect first
      if (messageHandler) {
        messageHandler(
          new MessageEvent("message", {
            origin: "https://parent.example.com",
            source: window.parent,
            data: {
              type: MessageType.HANDSHAKE_REQUEST,
              id: "hs-1",
              timestamp: Date.now(),
              version: "0.0.1",
            },
          }),
        );
      }

      // Clear previous calls
      parentPostMessage.mockClear();

      // Send request
      if (messageHandler) {
        messageHandler(
          new MessageEvent("message", {
            origin: "https://parent.example.com",
            source: window.parent,
            data: {
              type: MessageType.REQUEST,
              id: "req-1",
              timestamp: Date.now(),
              method: "math/add",
              payload: { a: 5, b: 3 },
            },
          }),
        );
      }

      // Wait for async handler
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(parentPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.RESPONSE,
          requestId: "req-1",
          success: true,
          data: { result: 8 },
        }),
        "https://parent.example.com",
      );
    });

    it("should handle async handlers", async () => {
      new ChildBridge<TestContract, Record<string, never>>({
        origin: "https://parent.example.com",
        methods: {
          "math/add": async ({ a, b }) => {
            await new Promise((resolve) => setTimeout(resolve, 5));
            return { result: a + b };
          },
        },
      });

      // Connect
      if (messageHandler) {
        messageHandler(
          new MessageEvent("message", {
            origin: "https://parent.example.com",
            source: window.parent,
            data: {
              type: MessageType.HANDSHAKE_REQUEST,
              id: "hs-1",
              timestamp: Date.now(),
              version: "0.0.1",
            },
          }),
        );
      }

      parentPostMessage.mockClear();

      // Send request
      if (messageHandler) {
        messageHandler(
          new MessageEvent("message", {
            origin: "https://parent.example.com",
            source: window.parent,
            data: {
              type: MessageType.REQUEST,
              id: "req-1",
              timestamp: Date.now(),
              method: "math/add",
              payload: { a: 2, b: 3 },
            },
          }),
        );
      }

      // Wait for async handler
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(parentPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.RESPONSE,
          success: true,
          data: { result: 5 },
        }),
        "https://parent.example.com",
      );
    });

    it("should return error for unknown method", async () => {
      new ChildBridge<TestContract, Record<string, never>>({
        origin: "https://parent.example.com",
        methods: {},
      });

      // Connect
      if (messageHandler) {
        messageHandler(
          new MessageEvent("message", {
            origin: "https://parent.example.com",
            source: window.parent,
            data: {
              type: MessageType.HANDSHAKE_REQUEST,
              id: "hs-1",
              timestamp: Date.now(),
              version: "0.0.1",
            },
          }),
        );
      }

      parentPostMessage.mockClear();

      // Send request for unknown method
      if (messageHandler) {
        messageHandler(
          new MessageEvent("message", {
            origin: "https://parent.example.com",
            source: window.parent,
            data: {
              type: MessageType.REQUEST,
              id: "req-1",
              timestamp: Date.now(),
              method: "unknown/method",
              payload: {},
            },
          }),
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(parentPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.RESPONSE,
          requestId: "req-1",
          success: false,
          error: expect.objectContaining({
            code: BridgeErrorCode.METHOD_NOT_FOUND,
          }),
        }),
        "https://parent.example.com",
      );
    });

    it("should return error when handler throws", async () => {
      new ChildBridge<TestContract, Record<string, never>>({
        origin: "https://parent.example.com",
        methods: {
          "error/throw": () => {
            throw new Error("Test error");
          },
        },
      });

      // Connect
      if (messageHandler) {
        messageHandler(
          new MessageEvent("message", {
            origin: "https://parent.example.com",
            source: window.parent,
            data: {
              type: MessageType.HANDSHAKE_REQUEST,
              id: "hs-1",
              timestamp: Date.now(),
              version: "0.0.1",
            },
          }),
        );
      }

      parentPostMessage.mockClear();

      // Send request
      if (messageHandler) {
        messageHandler(
          new MessageEvent("message", {
            origin: "https://parent.example.com",
            source: window.parent,
            data: {
              type: MessageType.REQUEST,
              id: "req-1",
              timestamp: Date.now(),
              method: "error/throw",
              payload: {},
            },
          }),
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(parentPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.RESPONSE,
          success: false,
          error: expect.objectContaining({
            code: BridgeErrorCode.HANDLER_ERROR,
          }),
        }),
        "https://parent.example.com",
      );
    });

    it("should not process requests before connected", async () => {
      new ChildBridge<TestContract, Record<string, never>>({
        origin: "https://parent.example.com",
        methods: {
          "math/add": ({ a, b }) => ({ result: a + b }),
        },
      });

      // Don't connect, just send request
      if (messageHandler) {
        messageHandler(
          new MessageEvent("message", {
            origin: "https://parent.example.com",
            source: window.parent,
            data: {
              type: MessageType.REQUEST,
              id: "req-1",
              timestamp: Date.now(),
              method: "math/add",
              payload: { a: 1, b: 2 },
            },
          }),
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should not respond
      expect(parentPostMessage).not.toHaveBeenCalled();
    });
  });

  describe("bi-directional calls", () => {
    it("should reject call if not connected", async () => {
      const bridge = new ChildBridge<TestContract, ParentContract>({
        origin: "https://parent.example.com",
        methods: {},
      });

      await expect(bridge.call("parent/ping", {})).rejects.toMatchObject({
        code: BridgeErrorCode.NOT_CONNECTED,
      });
    });
  });

  describe("destroy", () => {
    it("should cleanup on destroy", () => {
      const bridge = new ChildBridge<TestContract, Record<string, never>>({
        origin: "https://parent.example.com",
        methods: {},
      });

      bridge.destroy();

      expect(bridge.getState()).toBe("destroyed");
      expect(window.removeEventListener).toHaveBeenCalled();
    });

    it("should be idempotent", () => {
      const bridge = new ChildBridge<TestContract, Record<string, never>>({
        origin: "https://parent.example.com",
        methods: {},
      });

      bridge.destroy();
      bridge.destroy(); // Should not throw

      expect(bridge.getState()).toBe("destroyed");
    });
  });
});
