/**
 * Type-safe bidirectional RPC communication between parent window and iframe
 *
 * @example
 * // Define your API contract
 * type ParentMethods = {
 *   getUser: (id: string) => Promise<{ name: string; age: number }>;
 *   notify: (message: string) => void;
 * };
 *
 * type IframeMethods = {
 *   initialize: (config: { theme: string }) => Promise<void>;
 *   getStatus: () => Promise<'ready' | 'loading'>;
 * };
 *
 * // In parent
 * const bridge = createParentBridge<ParentMethods, IframeMethods>(iframe, {
 *   getUser: async (id) => ({ name: 'John', age: 30 }),
 *   notify: (message) => console.log(message),
 * });
 * const status = await bridge.call.getStatus();
 *
 * // In iframe
 * const bridge = createIframeBridge<IframeMethods, ParentMethods>({
 *   initialize: async (config) => { ... },
 *   getStatus: async () => 'ready',
 * });
 * const user = await bridge.call.getUser('123');
 */

import type { MethodContract } from './types';
import type { BridgeOptions } from './config';
import { mergeOptions } from './config';
import { warnIfInsecureOrigin } from './utils';
import { createBridge, type Bridge } from './bridge';

// ============================================================================
// Public API
// ============================================================================

/**
 * Create a bridge in the parent window to communicate with an iframe
 *
 * @param iframe - The iframe element to communicate with
 * @param handlers - Object containing methods that the iframe can call
 * @param options - Bridge configuration options
 * @returns Bridge instance with type-safe call proxy
 *
 * @example
 * const bridge = createParentBridge<ParentMethods, IframeMethods>(
 *   document.getElementById('my-iframe') as HTMLIFrameElement,
 *   {
 *     getData: async (key) => localStorage.getItem(key),
 *     setData: async (key, value) => localStorage.setItem(key, value),
 *   }
 * );
 *
 * // Call iframe methods with full type safety
 * const result = await bridge.call.iframeMethod(arg1, arg2);
 */
export function createParentBridge<
    TLocal extends MethodContract,
    TRemote extends MethodContract
>(
    iframe: HTMLIFrameElement,
    handlers: TLocal,
    options: BridgeOptions = {}
): Bridge<TLocal, TRemote> {
    if (!iframe.contentWindow) {
        throw new Error('Iframe contentWindow is not available. Make sure the iframe is loaded.');
    }

    const mergedOptions = mergeOptions(options);
    warnIfInsecureOrigin(mergedOptions);

    return createBridge<TLocal, TRemote>(
        iframe.contentWindow,
        handlers,
        mergedOptions,
        'parent'
    );
}

/**
 * Create a bridge in the iframe to communicate with the parent window
 *
 * @param handlers - Object containing methods that the parent can call
 * @param options - Bridge configuration options
 * @returns Bridge instance with type-safe call proxy
 *
 * @example
 * const bridge = createIframeBridge<IframeMethods, ParentMethods>({
 *   getStatus: async () => 'ready',
 *   initialize: async (config) => {
 *     console.log('Initialized with:', config);
 *   },
 * });
 *
 * // Call parent methods with full type safety
 * const data = await bridge.call.getData('user');
 */
export function createIframeBridge<
    TLocal extends MethodContract,
    TRemote extends MethodContract
>(
    handlers: TLocal,
    options: BridgeOptions = {}
): Bridge<TLocal, TRemote> {
    if (!window.parent || window.parent === window) {
        throw new Error('Not running inside an iframe');
    }

    const mergedOptions = mergeOptions(options);
    warnIfInsecureOrigin(mergedOptions);

    return createBridge<TLocal, TRemote>(
        window.parent,
        handlers,
        mergedOptions,
        'iframe'
    );
}

// ============================================================================
// Re-exports
// ============================================================================

// Error classes
export { RpcError, RpcTimeoutError, RpcMethodNotFoundError } from './errors';

// Configuration types
export type { BridgeOptions, RetryOptions } from './config';

// Bridge interface
export type { Bridge } from './bridge';

// Message types and constants
export { MESSAGE_TYPE } from './messages';
export type {
    RpcMessage,
    RequestMessage,
    ResponseMessage,
    ErrorMessage,
    FireAndForgetMessage,
} from './messages';

// Type utilities
export type {
    MethodContract,
    CallProxy,
    VoidMethods,
    ValueMethods,
    IsFunction,
    DefineContract,
    ParamsOf,
    ReturnOf,
} from './types';
