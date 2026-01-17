/**
 * Parent Bridge implementation
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
  ConnectionState,
  HandshakeAck,
  HandshakeRequest,
  Logger,
  ParentBridgeConfig,
  PartialHandlers,
  RequestPayload,
  ResponsePayload,
} from "./types";

import {
  BridgeError,
  BridgeErrorCode,
  DEFAULT_HANDSHAKE_TIMEOUT,
  DEFAULT_TIMEOUT,
  MessageType,
  isHandshakeAck,
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
  private state: ConnectionState = "disconnected";

  /** Target window reference */
  private targetWindow: Window | null = null;

  /** Allowed origins (normalized to array) */
  private readonly allowedOrigins: readonly string[];

  /** Default timeout */
  private readonly timeout: number;

  /** Handshake timeout */
  private readonly handshakeTimeout: number;

  /** Handshake retry count */
  private readonly handshakeRetries: number;

  /** Delay between retries */
  private readonly retryDelay: number;

  /** Bridge ID */
  private readonly bridgeId: string | undefined;

  /** Target element or window */
  private readonly target: HTMLIFrameElement | Window;

  /** Local method handlers for bi-directional calls */
  private readonly handlers: PartialHandlers<LocalContract>;

  /** Logger instance */
  private readonly logger: Logger;

  /** Debug mode */
  private readonly debug: boolean;

  /** Bound message handler for cleanup */
  private readonly boundMessageHandler: (event: MessageEvent) => void;

  /** Remote methods discovered during handshake */
  private remoteMethods: readonly string[] = [];

  /** Handshake resolve function */
  private handshakeResolve: (() => void) | null = null;

  /** Pending handshake request ID for validation */
  private pendingHandshakeId: string | null = null;

  constructor(config: ParentBridgeConfig<LocalContract>) {
    // Normalize origin to array
    this.allowedOrigins = Array.isArray(config.origin) ? config.origin : [config.origin];

    // Validate origins
    if (this.allowedOrigins.length === 0) {
      throw new Error("At least one origin must be specified");
    }

    if (this.allowedOrigins.includes("*")) {
      console.warn(
        '[ParentBridge] Warning: Using "*" as origin is insecure. Use exact origins in production.',
      );
    }

    // Store config with defaults
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT;
    this.handshakeTimeout = config.handshakeTimeout ?? DEFAULT_HANDSHAKE_TIMEOUT;
    this.handshakeRetries = config.handshakeRetries ?? 3;
    this.retryDelay = config.retryDelay ?? 1000;
    this.bridgeId = config.bridgeId;
    this.target = config.target;
    this.debug = config.debug ?? false;

    this.handlers = (config.methods ?? {}) as PartialHandlers<LocalContract>;

    // Setup logger
    this.logger = config.logger ?? {
      debug: (msg, data) => this.debug && console.debug(`[ParentBridge] ${msg}`, data ?? ""),
      info: (msg, data) => this.debug && console.info(`[ParentBridge] ${msg}`, data ?? ""),
      warn: (msg, data) => console.warn(`[ParentBridge] ${msg}`, data ?? ""),
      error: (msg, data) => console.error(`[ParentBridge] ${msg}`, data ?? ""),
    };

    // Bind message handler
    this.boundMessageHandler = this.handleMessage.bind(this);
  }

  /**
   * Get the target window from config
   */
  private getTargetWindow(): Window {
    const { target } = this;

    if (target instanceof HTMLIFrameElement) {
      if (!target.contentWindow) {
        throw new BridgeError(
          BridgeErrorCode.NOT_CONNECTED,
          "Iframe contentWindow is not available. Ensure iframe is loaded.",
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
    if (this.state === "destroyed") {
      throw BridgeError.destroyed();
    }

    if (this.state === "connected") {
      this.logger.debug("Already connected");
      return;
    }

    if (this.state === "connecting") {
      throw new BridgeError(BridgeErrorCode.HANDSHAKE_FAILED, "Connection already in progress");
    }

    this.setState("connecting");

    try {
      this.targetWindow = this.getTargetWindow();

      // Add message listener
      window.addEventListener("message", this.boundMessageHandler);

      // Attempt handshake with retries
      await this.performHandshake();

      this.setState("connected");
      this.logger.info("Connected successfully", { remoteMethods: this.remoteMethods });
    } catch (error) {
      this.setState("disconnected");
      window.removeEventListener("message", this.boundMessageHandler);
      this.targetWindow = null;
      throw error;
    }
  }

  /**
   * Perform handshake with retry logic
   */
  private async performHandshake(): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.handshakeRetries; attempt++) {
      try {
        await this.attemptHandshake(this.handshakeTimeout);
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.logger.warn(`Handshake attempt ${attempt} failed`, { error: lastError.message });

        if (attempt < this.handshakeRetries) {
          await this.sleep(this.retryDelay);
        }
      }
    }

    throw new BridgeError(
      BridgeErrorCode.HANDSHAKE_FAILED,
      `Handshake failed after ${this.handshakeRetries} attempts`,
      { cause: lastError ?? undefined },
    );
  }

  /**
   * Single handshake attempt
   */
  private attemptHandshake(timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.handshakeResolve = resolve;

      const timeoutId = setTimeout(() => {
        this.handshakeResolve = null;
        reject(BridgeError.timeout("handshake", timeoutMs));
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
    const id = generateCorrelationId();
    this.pendingHandshakeId = id;

    const request: HandshakeRequest = {
      type: MessageType.HANDSHAKE_REQUEST,
      id,
      timestamp: Date.now(),
      version: VERSION,
      methods: Object.keys(this.handlers),
      bridgeId: this.bridgeId,
    };

    this.logger.debug("Sending handshake", request);
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
      this.logger.debug("Sending request", { method, id });
      this.postMessage(request);
    });
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

    // Validate source
    if (event.source !== this.targetWindow) {
      return;
    }

    const data: unknown = event.data;

    // Skip non-bridge messages
    if (!data || typeof data !== "object" || !("type" in data)) {
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
      void this.handleRequest(data);
      return;
    }
  }

  /**
   * Handle handshake acknowledgment
   */
  private handleHandshakeAck(ack: HandshakeAck): void {
    this.logger.debug("Received handshake ack", ack);

    // Validate that the ack is for our pending handshake request (security: prevent spoofed acks)
    if (ack.requestId !== this.pendingHandshakeId) {
      this.logger.warn("Received handshake ack with mismatched request ID", {
        expected: this.pendingHandshakeId,
        received: ack.requestId,
      });
      return;
    }

    this.remoteMethods = ack.methods;
    this.pendingHandshakeId = null;

    if (this.handshakeResolve) {
      this.handshakeResolve();
      this.handshakeResolve = null;
    }
  }

  /**
   * Handle response message
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

      // Map error code to BridgeErrorCode or use UNKNOWN
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
   * Handle incoming request (bi-directional)
   */
  private async handleRequest(request: BridgeRequest): Promise<void> {
    const { method, payload, id } = request;

    const handler = (this.handlers as Record<string, ((p: unknown) => unknown) | undefined>)[
      method
    ];

    if (!handler) {
      this.sendErrorResponse(id, BridgeError.methodNotFound(method));
      return;
    }

    try {
      const result = await handler(payload);
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
   * Post message to target window
   */
  private postMessage(message: unknown): void {
    if (!this.targetWindow) {
      throw BridgeError.notConnected();
    }

    // Use first allowed origin for sending (or * if configured)
    const targetOrigin = this.allowedOrigins[0] ?? "*";
    this.targetWindow.postMessage(message, targetOrigin);
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
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
   * Get remote methods discovered during handshake
   */
  getRemoteMethods(): readonly string[] {
    return this.remoteMethods;
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
    this.targetWindow = null;
    this.handshakeResolve = null;
    this.pendingHandshakeId = null;

    this.setState("destroyed");
  }
}
