/**
 * Configuration options and defaults for iframe-rpc bridges
 */

import { RpcTimeoutError } from './errors';

/** Configuration for retry behavior */
export interface RetryOptions {
    /** Maximum number of retry attempts. Default: 0 (no retries) */
    maxRetries?: number;
    /** Initial delay between retries in ms. Default: 1000 */
    retryDelay?: number;
    /** Backoff multiplier for exponential backoff. Default: 2 */
    retryBackoff?: number;
    /** Maximum delay between retries in ms. Default: 30000 */
    maxRetryDelay?: number;
    /** Custom function to determine if an error is retryable. Default: retries timeouts only */
    isRetryable?: (error: Error) => boolean;
}

/** Bridge configuration options */
export interface BridgeOptions {
    /** Timeout for RPC calls in milliseconds. Default: 30000 */
    timeout?: number;
    /** Target origin for postMessage. Default: '*' (consider security implications) */
    targetOrigin?: string;
    /** Optional channel name to isolate multiple bridges */
    channel?: string;
    /** Enable debug logging */
    debug?: boolean;
    /** Include stack traces in error responses. Default: false (security) */
    includeStackTraces?: boolean;
    /** Retry configuration for failed calls */
    retry?: RetryOptions;
}

/** Default retry options */
export const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
    maxRetries: 0,
    retryDelay: 1000,
    retryBackoff: 2,
    maxRetryDelay: 30000,
    isRetryable: (error: Error) => error instanceof RpcTimeoutError,
};

/** Fully resolved bridge options type */
export type ResolvedBridgeOptions = Omit<Required<BridgeOptions>, 'retry'> & {
    retry: Required<RetryOptions>;
};

/** Default bridge options */
export const DEFAULT_OPTIONS: ResolvedBridgeOptions = {
    timeout: 30000,
    targetOrigin: '*',
    channel: 'default',
    debug: false,
    includeStackTraces: false,
    retry: DEFAULT_RETRY_OPTIONS,
};

/** Merge user options with defaults, including nested retry options */
export function mergeOptions(options: BridgeOptions): ResolvedBridgeOptions {
    return {
        ...DEFAULT_OPTIONS,
        ...options,
        retry: {
            ...DEFAULT_RETRY_OPTIONS,
            ...options.retry,
        },
    };
}
