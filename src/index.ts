/**
 * Window-Iframe Bridge
 *
 * Type-safe window-iframe communication library for micro-frontends.
 *
 * @example
 * ```typescript
 * // Define your contract
 * interface MyContract extends BridgeContract {
 *   'user/get': { request: { id: string }, response: { name: string } };
 * }
 *
 * // Parent side
 * const parent = new ParentBridge<{}, MyContract>({
 *   target: iframe,
 *   origin: 'https://child.example.com',
 * });
 * await parent.connect();
 * const user = await parent.call('user/get', { id: '123' });
 *
 * // Child side
 * const child = new ChildBridge<MyContract, {}>({
 *   origin: 'https://parent.example.com',
 *   methods: {
 *     'user/get': async ({ id }) => ({ name: 'John' }),
 *   },
 * });
 * ```
 *
 * @packageDocumentation
 */

// Version
export const VERSION = "0.0.1";

// Re-export all types
export * from "./types";

// Bridge classes
export { ParentBridge } from "./parent-bridge";
export { ChildBridge } from "./child-bridge";