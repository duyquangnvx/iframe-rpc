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
  TIMEOUT: "BRIDGE_TIMEOUT",
  /** Method not found on remote */
  METHOD_NOT_FOUND: "BRIDGE_METHOD_NOT_FOUND",
  /** Handler threw an error */
  HANDLER_ERROR: "BRIDGE_HANDLER_ERROR",
  /** Origin validation failed */
  INVALID_ORIGIN: "BRIDGE_INVALID_ORIGIN",
  /** Connection not established */
  NOT_CONNECTED: "BRIDGE_NOT_CONNECTED",
  /** Handshake failed */
  HANDSHAKE_FAILED: "BRIDGE_HANDSHAKE_FAILED",
  /** Invalid message format */
  INVALID_MESSAGE: "BRIDGE_INVALID_MESSAGE",
  /** Validation failed (Zod) */
  VALIDATION_ERROR: "BRIDGE_VALIDATION_ERROR",
  /** Bridge already destroyed */
  DESTROYED: "BRIDGE_DESTROYED",
  /** Unknown error */
  UNKNOWN: "BRIDGE_UNKNOWN",
} as const;

export type BridgeErrorCodeValue = (typeof BridgeErrorCode)[keyof typeof BridgeErrorCode];

/**
 * Options for BridgeError constructor
 */
interface BridgeErrorOptions {
  details?: unknown;
  cause?: Error | undefined;
}

/**
 * Bridge error class with structured information
 */
export class BridgeError extends Error {
  /** Error code for programmatic handling */
  readonly code: BridgeErrorCodeValue;
  /** Additional error details */
  readonly details?: unknown;

  constructor(code: BridgeErrorCodeValue, message: string, options?: BridgeErrorOptions) {
    super(message, { cause: options?.cause });
    this.name = "BridgeError";
    this.code = code;
    this.details = options?.details;
  }

  /**
   * Create a timeout error
   */
  static timeout(method: string, timeoutMs: number): BridgeError {
    return new BridgeError(
      BridgeErrorCode.TIMEOUT,
      `Request to '${method}' timed out after ${timeoutMs}ms`,
    );
  }

  /**
   * Create a method not found error
   */
  static methodNotFound(method: string): BridgeError {
    return new BridgeError(BridgeErrorCode.METHOD_NOT_FOUND, `Method '${method}' not found`);
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
      "Bridge is not connected. Call connect() first.",
    );
  }

  /**
   * Create a destroyed error
   */
  static destroyed(): BridgeError {
    return new BridgeError(
      BridgeErrorCode.DESTROYED,
      "Bridge has been destroyed and cannot be used.",
    );
  }

  /**
   * Wrap an unknown error
   */
  static fromUnknown(error: unknown, context?: string): BridgeError {
    const message = error instanceof Error ? error.message : String(error);
    const cause = error instanceof Error ? error : undefined;
    return new BridgeError(BridgeErrorCode.UNKNOWN, context ? `${context}: ${message}` : message, {
      cause,
    });
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
      { cause },
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
