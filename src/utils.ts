/**
 * Utility functions for iframe-rpc
 */

import { MESSAGE_TYPE, type RpcMessage } from './messages';
import type { ResolvedBridgeOptions } from './config';

/** Generate a unique ID for RPC requests */
export function generateId(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    // Fallback with better entropy using getRandomValues when available
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        const array = new Uint32Array(2);
        crypto.getRandomValues(array);
        return `${array[0].toString(16)}-${array[1].toString(16)}-${Date.now().toString(36)}`;
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

// Cache valid message types for performance
const VALID_MESSAGE_TYPES = new Set(Object.values(MESSAGE_TYPE));

/** Type guard to check if data is a valid RPC message */
export function isRpcMessage(data: unknown): data is RpcMessage {
    return (
        typeof data === 'object' &&
        data !== null &&
        '__iframeRpc' in data &&
        (data as any).__iframeRpc === true &&
        'type' in data &&
        VALID_MESSAGE_TYPES.has((data as any).type)
    );
}

/** Warn if using insecure wildcard origin in debug mode */
export function warnIfInsecureOrigin(options: ResolvedBridgeOptions): void {
    if (options.debug && options.targetOrigin === '*') {
        console.warn('[iframe-rpc] Using targetOrigin:"*" is insecure for production. Consider specifying an exact origin.');
    }
}

/** Create a logger that only logs in debug mode */
export function createLogger(debug: boolean, prefix: string) {
    return {
        log: (...args: unknown[]) => {
            if (debug) console.log(`[${prefix}]`, ...args);
        },
        error: (...args: unknown[]) => {
            if (debug) console.error(`[${prefix}]`, ...args);
        },
    };
}

/** Sleep helper for retry delays */
export const sleep = (ms: number): Promise<void> =>
    new Promise(resolve => setTimeout(resolve, ms));
