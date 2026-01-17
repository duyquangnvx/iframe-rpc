/**
 * Timeout utilities for async operations
 *
 * @packageDocumentation
 */

import { BridgeError, BridgeErrorCode } from "../types";

/**
 * Pending request tracking
 */
export interface PendingRequest<T = unknown> {
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
  method: string;
  createdAt: number;
}

/**
 * Create a deferred promise with timeout
 */
export function createDeferredWithTimeout<T>(
  timeoutMs: number,
  method: string,
  onTimeout?: () => void,
): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  cleanup: () => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  let timeoutId: ReturnType<typeof setTimeout>;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;

    timeoutId = setTimeout(() => {
      onTimeout?.();
      rej(BridgeError.timeout(method, timeoutMs));
    }, timeoutMs);
  });

  const cleanup = () => {
    clearTimeout(timeoutId);
  };

  return { promise, resolve, reject, cleanup };
}

/**
 * Race a promise against a timeout
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new BridgeError(BridgeErrorCode.TIMEOUT, errorMessage));
      }, timeoutMs);
    }),
  ]);
}
