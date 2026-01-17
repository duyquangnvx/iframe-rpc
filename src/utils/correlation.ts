/**
 * Correlation ID generation utilities
 *
 * @packageDocumentation
 */

import type { CorrelationId } from "../types";

/**
 * Counter for unique IDs within session
 */
let counter = 0;

/**
 * Generate a unique correlation ID
 * Uses timestamp + counter for uniqueness without crypto overhead
 */
export function generateCorrelationId(): CorrelationId {
  return `${Date.now().toString(36)}-${(++counter).toString(36)}`;
}

/**
 * Reset counter (for testing)
 * @internal
 */
export function resetCounter(): void {
  counter = 0;
}
