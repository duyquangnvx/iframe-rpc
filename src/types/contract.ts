/**
 * Contract type definitions for type-safe RPC
 *
 * @packageDocumentation
 */

/**
 * Base contract definition pattern.
 * Users extend this to define their RPC methods.
 *
 * @example
 * ```typescript
 * interface MyContract extends BridgeContract {
 *   'user/get': { request: { id: string }, response: { name: string } };
 *   'user/update': { request: { id: string, name: string }, response: { success: boolean } };
 * }
 * ```
 */
export interface BridgeContract {
  [method: string]: {
    request: unknown;
    response: unknown;
  };
}

/**
 * Extract method names from a contract
 */
export type BridgeMethod<C extends BridgeContract> = keyof C & string;

/**
 * Extract request payload type for a method
 */
export type RequestPayload<C extends BridgeContract, M extends BridgeMethod<C>> = C[M]["request"];

/**
 * Extract response payload type for a method
 */
export type ResponsePayload<C extends BridgeContract, M extends BridgeMethod<C>> = C[M]["response"];

/**
 * Handler function type for a specific method
 */
export type MethodHandler<C extends BridgeContract, M extends BridgeMethod<C>> = (
  payload: RequestPayload<C, M>,
) => ResponsePayload<C, M> | Promise<ResponsePayload<C, M>>;

/**
 * Map of all handlers for a contract - with proper type inference
 */
export type ContractHandlers<C extends BridgeContract> = {
  [M in BridgeMethod<C>]: (
    payload: C[M]["request"],
  ) => C[M]["response"] | Promise<C[M]["response"]>;
};

/**
 * Partial handlers - for registering subset of methods
 * Uses explicit handler signatures for proper type inference
 */
export type PartialHandlers<C extends BridgeContract> = {
  [M in BridgeMethod<C>]?: (
    payload: C[M]["request"],
  ) => C[M]["response"] | Promise<C[M]["response"]>;
};

/**
 * Helper function to create handlers with full type inference.
 * Uses curried generic pattern to properly infer handler parameter types.
 *
 * @example
 * ```typescript
 * const handlers = createHandlers<MyAPI>()({
 *   'user/get': async (p) => {
 *     // p.id is typed as string!
 *     return { id: p.id, name: 'John' };
 *   }
 * });
 * ```
 */
export function createHandlers<C extends BridgeContract>() {
  return <K extends BridgeMethod<C>>(
    handlers: {
      [M in K]: (
        payload: C[M]["request"],
      ) => C[M]["response"] | Promise<C[M]["response"]>;
    },
  ): PartialHandlers<C> => handlers as PartialHandlers<C>;
}
