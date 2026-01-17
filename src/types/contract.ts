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
 * Map of all handlers for a contract
 */
export type ContractHandlers<C extends BridgeContract> = {
  [M in BridgeMethod<C>]: MethodHandler<C, M>;
};

/**
 * Partial handlers - for registering subset of methods
 */
export type PartialHandlers<C extends BridgeContract> = Partial<ContractHandlers<C>>;
