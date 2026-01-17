/**
 * Child Bridge implementation
 *
 * @packageDocumentation
 */

import type {
  BridgeContract,
  BridgeErrorCodeValue,
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
} from "./types";

import {
  BridgeError,
  BridgeErrorCode,
  DEFAULT_TIMEOUT,
  MessageType,
  isHandshakeRequest,
  isRequest,
  isResponse,
} from "./types";

import { generateCorrelationId } from "./utils/correlation";
import type { PendingRequest } from "./utils/timeout";

/**
 * Library version
 */
const VERSION = "0.0.1";

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
  private state: ConnectionState = "disconnected";

  /** Parent window origin (set after handshake) */
  private parentOrigin: string | null = null;

  /** Allowed origins (normalized to array) */
  private readonly allowedOrigins: readonly string[];

  /** Default timeout */
  private readonly timeout: number;

  /** Bridge ID */
  private readonly bridgeId: string | undefined;

  /** Local method handlers */
  private readonly handlers: PartialHandlers<LocalContract>;

  /** Logger instance */
  private readonly logger: Logger;

  /** Debug mode */
  private readonly debug: boolean;

  /** Bound message handler for cleanup */
  private readonly boundMessageHandler: (event: MessageEvent) => void;

  /** Parent methods discovered during handshake */
  private parentMethods: readonly string[] = [];

  constructor(config: ChildBridgeConfig<LocalContract, RemoteContract>) {
    // Normalize origin to array
    this.allowedOrigins = Array.isArray(config.origin) ? config.origin : [config.origin];

    // Validate origins
    if (this.allowedOrigins.length === 0) {
      throw new Error("At least one origin must be specified");
    }

    if (this.allowedOrigins.includes("*")) {
      console.warn(
        '[ChildBridge] Warning: Using "*" as origin is insecure. Use exact origins in production.',
      );
    }

    // Store config with defaults
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT;
    this.bridgeId = config.bridgeId;
    this.debug = config.debug ?? false;
    this.handlers = config.methods;

    // Setup logger
    this.logger = config.logger ?? {
      debug: (msg, data) => this.debug && console.debug(`[ChildBridge] ${msg}`, data ?? ""),
      info: (msg, data) => this.debug && console.info(`[ChildBridge] ${msg}`, data ?? ""),
      warn: (msg, data) => console.warn(`[ChildBridge] ${msg}`, data ?? ""),
      error: (msg, data) => console.error(`[ChildBridge] ${msg}`, data ?? ""),
    };

    // Bind message handler
    this.boundMessageHandler = this.handleMessage.bind(this);

    // Start listening immediately (child is passive)
    this.startListening();
  }

  /**
   * Start listening for messages from parent
   */
  private startListening(): void {
    window.addEventListener("message", this.boundMessageHandler);
    this.logger.debug("Started listening for messages");
  }

  /**
   * Handle incoming messages
   */
  private handleMessage(event: MessageEvent): void {
    // Validate origin
    if (!this.isValidOrigin(event.origin)) {
      this.logger.warn("Rejected message from invalid origin", { origin: event.origin });
      return;
    }

    // Validate source is parent window (security: prevent spoofing from other same-origin windows)
    if (event.source !== window.parent) {
      this.logger.warn("Rejected message from non-parent source");
      return;
    }

    const data: unknown = event.data;

    // Skip non-bridge messages
    if (!data || typeof data !== "object" || !("type" in data)) {
      return;
    }

    // Handle handshake request (always accept even if already connected for re-connection)
    if (isHandshakeRequest(data)) {
      this.handleHandshakeRequest(data, event.origin, event.source as Window);
      return;
    }

    // Only process other messages if connected
    if (this.state !== "connected") {
      this.logger.warn("Received message before connected", {
        type: (data as { type: string }).type,
      });
      return;
    }

    // Handle request from parent
    if (isRequest(data)) {
      void this.handleRequest(data);
      return;
    }

    // Handle response (for bi-directional calls)
    if (isResponse(data)) {
      this.handleResponse(data);
      return;
    }
  }

  /**
   * Handle handshake request from parent
   */
  private handleHandshakeRequest(request: HandshakeRequest, origin: string, source: Window): void {
    this.logger.debug("Received handshake request", request);

    // Store parent origin for future communication
    this.parentOrigin = origin;

    // Store parent methods if provided
    if (request.methods) {
      this.parentMethods = request.methods;
    }

    // Create acknowledgment
    const ack: HandshakeAck = {
      type: MessageType.HANDSHAKE_ACK,
      id: generateCorrelationId(),
      timestamp: Date.now(),
      version: VERSION,
      methods: Object.keys(this.handlers),
      requestId: request.id,
      bridgeId: this.bridgeId,
    };

    // Send acknowledgment
    source.postMessage(ack, origin);

    // Update state
    this.setState("connected");
    this.logger.info("Connected to parent", { origin, parentMethods: this.parentMethods });
  }

  /**
   * Handle incoming request from parent
   */
  private async handleRequest(request: BridgeRequest): Promise<void> {
    const { method, payload, id } = request;

    this.logger.debug("Received request", { method, id });

    const handler = (this.handlers as Record<string, ((p: unknown) => unknown) | undefined>)[
      method
    ];

    if (!handler) {
      this.logger.warn("Method not found", { method });
      this.sendErrorResponse(id, BridgeError.methodNotFound(method));
      return;
    }

    try {
      const result = await handler(payload);
      this.sendSuccessResponse(id, result);
    } catch (error) {
      this.logger.error("Handler error", { method, error });
      this.sendErrorResponse(id, BridgeError.handlerError(method, error));
    }
  }

  /**
   * Handle response message (for bi-directional calls)
   */
  private handleResponse(response: BridgeResponse): void {
    const pending = this.pending.get(response.requestId);

    if (!pending) {
      this.logger.warn("Received response for unknown request", {
        requestId: response.requestId,
      });
      return;
    }

    // Cleanup
    clearTimeout(pending.timeoutId);
    this.pending.delete(response.requestId);

    if (response.success) {
      this.logger.debug("Request succeeded", {
        method: pending.method,
        requestId: response.requestId,
      });
      pending.resolve((response as BridgeResponseSuccess).data);
    } else {
      const errorResponse = response as BridgeResponseError;
      this.logger.debug("Request failed", {
        method: pending.method,
        error: errorResponse.error,
      });

      const errorCode = this.mapErrorCode(errorResponse.error.code);
      pending.reject(
        new BridgeError(errorCode, errorResponse.error.message, {
          details: errorResponse.error.details,
        }),
      );
    }
  }

  /**
   * Map string error code to BridgeErrorCodeValue
   */
  private mapErrorCode(code: string): BridgeErrorCodeValue {
    const validCodes = Object.values(BridgeErrorCode);
    if (validCodes.includes(code as BridgeErrorCodeValue)) {
      return code as BridgeErrorCodeValue;
    }
    return BridgeErrorCode.UNKNOWN;
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
      bridgeId: this.bridgeId,
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
      bridgeId: this.bridgeId,
    };

    this.postMessage(response);
  }

  /**
   * Post message to parent window
   */
  private postMessage(message: unknown): void {
    if (!this.parentOrigin) {
      throw BridgeError.notConnected();
    }

    window.parent.postMessage(message, this.parentOrigin);
  }

  /**
   * Validate message origin
   */
  private isValidOrigin(origin: string): boolean {
    return this.allowedOrigins.includes("*") || this.allowedOrigins.includes(origin);
  }

  /**
   * Update connection state
   */
  private setState(newState: ConnectionState): void {
    const from = this.state;
    this.state = newState;
    this.logger.debug("State changed", { from, to: newState });
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
  call<M extends BridgeMethod<RemoteContract>>(
    method: M,
    payload: RequestPayload<RemoteContract, M>,
    options?: CallOptions,
  ): Promise<ResponsePayload<RemoteContract, M>> {
    if (this.state !== "connected") {
      return Promise.reject(BridgeError.notConnected());
    }

    const id = generateCorrelationId();
    const callTimeout = options?.timeout ?? this.timeout;

    const request: BridgeRequest<RemoteContract, M> = {
      type: MessageType.REQUEST,
      id,
      timestamp: Date.now(),
      method,
      payload,
      bridgeId: this.bridgeId,
    };

    return new Promise((resolve, reject) => {
      // Setup timeout
      const timeoutId = setTimeout(() => {
        this.pending.delete(id);
        reject(BridgeError.timeout(method, callTimeout));
      }, callTimeout);

      // Store pending request
      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeoutId,
        method,
        createdAt: Date.now(),
      });

      // Send request
      this.logger.debug("Sending request to parent", { method, id });
      this.postMessage(request);
    });
  }

  /**
   * Check if bridge is connected
   */
  isConnected(): boolean {
    return this.state === "connected";
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
   * Destroy the bridge and cleanup resources
   */
  destroy(): void {
    if (this.state === "destroyed") {
      return;
    }

    this.logger.debug("Destroying bridge");

    // Reject all pending requests
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timeoutId);
      pending.reject(BridgeError.destroyed());
    }
    this.pending.clear();

    // Remove listener
    window.removeEventListener("message", this.boundMessageHandler);

    // Clear references
    this.parentOrigin = null;

    this.setState("destroyed");
  }
}
