/**
 * Type tests for contract and message types
 */

import { describe, expect, it } from "vitest";
import {
  type BridgeContract,
  BridgeError,
  BridgeErrorCode,
  type BridgeRequest,
  type BridgeResponse,
  type HandshakeAck,
  type HandshakeRequest,
  MessageType,
  isErrorResponse,
  isHandshakeAck,
  isHandshakeRequest,
  isRequest,
  isResponse,
  isSuccessResponse,
} from "../src";

describe("MessageType constants", () => {
  it("should have correct message type values", () => {
    expect(MessageType.REQUEST).toBe("bridge:request");
    expect(MessageType.RESPONSE).toBe("bridge:response");
    expect(MessageType.HANDSHAKE_REQUEST).toBe("bridge:handshake:request");
    expect(MessageType.HANDSHAKE_ACK).toBe("bridge:handshake:ack");
  });
});

describe("Type guards", () => {
  describe("isRequest", () => {
    it("should return true for valid request", () => {
      const request: BridgeRequest = {
        type: MessageType.REQUEST,
        id: "test-1",
        timestamp: Date.now(),
        method: "test/method",
        payload: { data: "test" },
      };
      expect(isRequest(request)).toBe(true);
    });

    it("should return false for response", () => {
      const response = {
        type: MessageType.RESPONSE,
        id: "test-1",
        timestamp: Date.now(),
        requestId: "req-1",
        success: true,
        data: {},
      };
      expect(isRequest(response)).toBe(false);
    });

    it("should return false for non-object", () => {
      expect(isRequest(null)).toBe(false);
      expect(isRequest(undefined)).toBe(false);
      expect(isRequest("string")).toBe(false);
      expect(isRequest(123)).toBe(false);
    });

    it("should return false for object without type", () => {
      expect(isRequest({ id: "test" })).toBe(false);
    });
  });

  describe("isResponse", () => {
    it("should return true for success response", () => {
      const response = {
        type: MessageType.RESPONSE,
        id: "test-1",
        timestamp: Date.now(),
        requestId: "req-1",
        success: true,
        data: { result: "ok" },
      };
      expect(isResponse(response)).toBe(true);
    });

    it("should return true for error response", () => {
      const response = {
        type: MessageType.RESPONSE,
        id: "test-1",
        timestamp: Date.now(),
        requestId: "req-1",
        success: false,
        error: { code: "ERROR", message: "Failed" },
      };
      expect(isResponse(response)).toBe(true);
    });

    it("should return false for request", () => {
      const request = {
        type: MessageType.REQUEST,
        id: "test-1",
        timestamp: Date.now(),
        method: "test",
        payload: {},
      };
      expect(isResponse(request)).toBe(false);
    });
  });

  describe("isHandshakeRequest", () => {
    it("should return true for valid handshake request", () => {
      const request: HandshakeRequest = {
        type: MessageType.HANDSHAKE_REQUEST,
        id: "hs-1",
        timestamp: Date.now(),
        version: "0.0.1",
      };
      expect(isHandshakeRequest(request)).toBe(true);
    });

    it("should return false for other message types", () => {
      const ack = {
        type: MessageType.HANDSHAKE_ACK,
        id: "hs-1",
        timestamp: Date.now(),
        version: "0.0.1",
        methods: [],
        requestId: "req-1",
      };
      expect(isHandshakeRequest(ack)).toBe(false);
    });
  });

  describe("isHandshakeAck", () => {
    it("should return true for valid handshake ack", () => {
      const ack: HandshakeAck = {
        type: MessageType.HANDSHAKE_ACK,
        id: "hs-1",
        timestamp: Date.now(),
        version: "0.0.1",
        methods: ["test/method"],
        requestId: "req-1",
      };
      expect(isHandshakeAck(ack)).toBe(true);
    });
  });

  describe("isSuccessResponse / isErrorResponse", () => {
    it("should correctly identify success response", () => {
      const success: BridgeResponse = {
        type: MessageType.RESPONSE,
        id: "test-1",
        timestamp: Date.now(),
        requestId: "req-1",
        success: true,
        data: {},
      };
      expect(isSuccessResponse(success)).toBe(true);
      expect(isErrorResponse(success)).toBe(false);
    });

    it("should correctly identify error response", () => {
      const error: BridgeResponse = {
        type: MessageType.RESPONSE,
        id: "test-1",
        timestamp: Date.now(),
        requestId: "req-1",
        success: false,
        error: { code: "ERROR", message: "Failed" },
      };
      expect(isSuccessResponse(error)).toBe(false);
      expect(isErrorResponse(error)).toBe(true);
    });
  });
});

describe("BridgeError", () => {
  it("should create error with code and message", () => {
    const error = new BridgeError(BridgeErrorCode.TIMEOUT, "Request timed out");
    expect(error.code).toBe(BridgeErrorCode.TIMEOUT);
    expect(error.message).toBe("Request timed out");
    expect(error.name).toBe("BridgeError");
  });

  it("should create error with details", () => {
    const error = new BridgeError(BridgeErrorCode.INVALID_ORIGIN, "Origin not allowed", {
      details: { origin: "http://evil.com" },
    });
    expect(error.details).toEqual({ origin: "http://evil.com" });
  });

  it("should create error with cause", () => {
    const cause = new Error("Original error");
    const error = new BridgeError(BridgeErrorCode.HANDLER_ERROR, "Handler failed", { cause });
    expect(error.cause).toBe(cause);
  });

  describe("static factory methods", () => {
    it("timeout() creates timeout error", () => {
      const error = BridgeError.timeout("user/get", 5000);
      expect(error.code).toBe(BridgeErrorCode.TIMEOUT);
      expect(error.message).toContain("user/get");
      expect(error.message).toContain("5000ms");
    });

    it("methodNotFound() creates method not found error", () => {
      const error = BridgeError.methodNotFound("unknown/method");
      expect(error.code).toBe(BridgeErrorCode.METHOD_NOT_FOUND);
      expect(error.message).toContain("unknown/method");
    });

    it("invalidOrigin() creates invalid origin error", () => {
      const error = BridgeError.invalidOrigin("http://bad.com", ["http://good.com"]);
      expect(error.code).toBe(BridgeErrorCode.INVALID_ORIGIN);
      expect(error.details).toEqual({
        origin: "http://bad.com",
        allowed: ["http://good.com"],
      });
    });

    it("notConnected() creates not connected error", () => {
      const error = BridgeError.notConnected();
      expect(error.code).toBe(BridgeErrorCode.NOT_CONNECTED);
    });

    it("destroyed() creates destroyed error", () => {
      const error = BridgeError.destroyed();
      expect(error.code).toBe(BridgeErrorCode.DESTROYED);
    });

    it("fromUnknown() wraps unknown error", () => {
      const original = new Error("Something went wrong");
      const error = BridgeError.fromUnknown(original, "Context");
      expect(error.code).toBe(BridgeErrorCode.UNKNOWN);
      expect(error.message).toContain("Context");
      expect(error.message).toContain("Something went wrong");
      expect(error.cause).toBe(original);
    });

    it("fromUnknown() handles non-Error values", () => {
      const error = BridgeError.fromUnknown("string error");
      expect(error.message).toBe("string error");
      expect(error.cause).toBeUndefined();
    });

    it("handlerError() creates handler error", () => {
      const cause = new Error("Handler threw");
      const error = BridgeError.handlerError("user/get", cause);
      expect(error.code).toBe(BridgeErrorCode.HANDLER_ERROR);
      expect(error.message).toContain("user/get");
      expect(error.cause).toBe(cause);
    });
  });

  describe("toJSON()", () => {
    it("should serialize to plain object", () => {
      const error = new BridgeError(BridgeErrorCode.TIMEOUT, "Timed out", {
        details: { ms: 5000 },
      });
      const json = error.toJSON();
      expect(json).toEqual({
        code: BridgeErrorCode.TIMEOUT,
        message: "Timed out",
        details: { ms: 5000 },
      });
    });
  });
});

describe("Type inference", () => {
  it("should infer request and response types from contract", () => {
    // This is a compile-time test - if it compiles, types work
    interface TestContract extends BridgeContract {
      "user/get": { request: { id: string }; response: { name: string } };
      "user/create": { request: { name: string }; response: { id: string; name: string } };
    }

    // Type check: these should compile without errors
    type GetRequest = TestContract["user/get"]["request"];
    type GetResponse = TestContract["user/get"]["response"];

    const _req: GetRequest = { id: "123" };
    const _res: GetResponse = { name: "John" };

    expect(_req.id).toBe("123");
    expect(_res.name).toBe("John");
  });
});
