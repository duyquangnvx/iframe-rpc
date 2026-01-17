/**
 * Configuration types for bridge instances
 *
 * @packageDocumentation
 */

import type { BridgeContract, PartialHandlers } from "./contract";

/**
 * Default timeout in milliseconds
 */
export const DEFAULT_TIMEOUT = 10000;

/**
 * Default handshake timeout in milliseconds
 */
export const DEFAULT_HANDSHAKE_TIMEOUT = 5000;

/**
 * Logging levels
 */
export type LogLevel = "debug" | "info" | "warn" | "error" | "none";

/**
 * Logger interface for custom logging
 */
export interface Logger {
  debug: (message: string, data?: unknown) => void;
  info: (message: string, data?: unknown) => void;
  warn: (message: string, data?: unknown) => void;
  error: (message: string, data?: unknown) => void;
}

/**
 * Base configuration shared by parent and child
 */
export interface BaseBridgeConfig {
  /**
   * Default timeout for RPC calls in milliseconds
   * @default 10000
   */
  timeout?: number;

  /**
   * Unique identifier for this bridge instance
   * Useful when multiple bridges exist
   */
  bridgeId?: string;

  /**
   * Enable debug logging
   * @default false
   */
  debug?: boolean;

  /**
   * Custom logger implementation
   * If not provided, uses console
   */
  logger?: Logger;

  /**
   * Log level
   * @default 'warn'
   */
  logLevel?: LogLevel;
}

/**
 * Configuration for ParentBridge
 */
export interface ParentBridgeConfig<LocalContract extends BridgeContract = BridgeContract>
  extends BaseBridgeConfig {
  /**
   * Target iframe element or its contentWindow
   */
  target: HTMLIFrameElement | Window;

  /**
   * Allowed origin(s) for the child iframe
   * Use exact origins, never '*' in production
   */
  origin: string | readonly string[];

  /**
   * Local methods that child can call (bi-directional communication)
   */
  methods?: PartialHandlers<LocalContract>;

  /**
   * Timeout for handshake in milliseconds
   * @default 5000
   */
  handshakeTimeout?: number;

  /**
   * Number of handshake retry attempts
   * @default 3
   */
  handshakeRetries?: number;

  /**
   * Delay between retry attempts in milliseconds
   * @default 1000
   */
  retryDelay?: number;
}

/**
 * Configuration for ChildBridge
 */
export interface ChildBridgeConfig<
  LocalContract extends BridgeContract = BridgeContract,
  RemoteContract extends BridgeContract = BridgeContract,
> extends BaseBridgeConfig {
  /**
   * Allowed origin(s) for the parent window
   * Use exact origins, never '*' in production
   */
  origin: string | readonly string[];

  /**
   * Local methods that parent can call
   */
  methods: PartialHandlers<LocalContract>;

  /**
   * Methods that the parent provides (for validation)
   */
  remoteMethods?: readonly (keyof RemoteContract & string)[];
}

/**
 * Options for individual RPC calls
 */
export interface CallOptions {
  /**
   * Override default timeout for this call
   */
  timeout?: number;
}

/**
 * Connection state
 */
export type ConnectionState = "disconnected" | "connecting" | "connected" | "destroyed";

/**
 * Connection state change event
 */
export interface ConnectionStateEvent {
  /** Previous state */
  from: ConnectionState;
  /** New state */
  to: ConnectionState;
  /** Timestamp of change */
  timestamp: number;
}
