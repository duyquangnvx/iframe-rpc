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

// ============================================================================
// Type Utilities
// ============================================================================

/** Extract the return type, unwrapping Promise if needed */
type UnwrapPromise<T> = T extends Promise<infer U> ? U : T;

/** Check if a type is a function */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _IsFunction<T> = T extends (...args: any[]) => any ? true : false;

/** Method definition - can be sync or async */
type AnyMethod = (...args: any[]) => any;

/** Contract for RPC methods */
type MethodContract = Record<string, AnyMethod>;

/** Extract methods that return void (fire-and-forget) */
type VoidMethods<T extends MethodContract> = {
    [K in keyof T]: UnwrapPromise<ReturnType<T[K]>> extends void ? K : never;
}[keyof T];

/** Extract methods that return a value (request-response) */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _ValueMethods<T extends MethodContract> = Exclude<keyof T, VoidMethods<T>>;

// ============================================================================
// Message Types
// ============================================================================

const MESSAGE_TYPE = {
    REQUEST: 'iframe-rpc:request',
    RESPONSE: 'iframe-rpc:response',
    ERROR: 'iframe-rpc:error',
    FIRE_AND_FORGET: 'iframe-rpc:fire-and-forget',
} as const;

interface BaseMessage {
    __iframeRpc: true;
    channel?: string;
}

interface RequestMessage<T extends MethodContract = MethodContract> extends BaseMessage {
    type: typeof MESSAGE_TYPE.REQUEST;
    id: string;
    method: keyof T & string;
    args: unknown[];
}

interface ResponseMessage extends BaseMessage {
    type: typeof MESSAGE_TYPE.RESPONSE;
    id: string;
    result: unknown;
}

interface ErrorMessage extends BaseMessage {
    type: typeof MESSAGE_TYPE.ERROR;
    id: string;
    error: {
        message: string;
        code?: string;
        stack?: string;
    };
}

interface FireAndForgetMessage<T extends MethodContract = MethodContract> extends BaseMessage {
    type: typeof MESSAGE_TYPE.FIRE_AND_FORGET;
    method: keyof T & string;
    args: unknown[];
}

type RpcMessage<T extends MethodContract = MethodContract> =
    | RequestMessage<T>
    | ResponseMessage
    | ErrorMessage
    | FireAndForgetMessage<T>;

// ============================================================================
// Error Types
// ============================================================================

export class RpcError extends Error {
    constructor(
        message: string,
        public readonly code?: string,
        public readonly originalStack?: string
    ) {
        super(message);
        this.name = 'RpcError';
    }
}

export class RpcTimeoutError extends RpcError {
    constructor(method: string, timeout: number) {
        super(`RPC call to "${method}" timed out after ${timeout}ms`, 'TIMEOUT');
        this.name = 'RpcTimeoutError';
    }
}

export class RpcMethodNotFoundError extends RpcError {
    constructor(method: string) {
        super(`Method "${method}" not found`, 'METHOD_NOT_FOUND');
        this.name = 'RpcMethodNotFoundError';
    }
}

// ============================================================================
// Configuration
// ============================================================================

export interface BridgeOptions {
    /** Timeout for RPC calls in milliseconds. Default: 30000 */
    timeout?: number;
    /** Target origin for postMessage. Default: '*' (consider security implications) */
    targetOrigin?: string;
    /** Optional channel name to isolate multiple bridges */
    channel?: string;
    /** Enable debug logging */
    debug?: boolean;
}

const DEFAULT_OPTIONS: Required<BridgeOptions> = {
    timeout: 30000,
    targetOrigin: '*',
    channel: 'default',
    debug: false,
};

// ============================================================================
// Utility Functions
// ============================================================================

function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function isRpcMessage(data: unknown): data is RpcMessage {
    return (
        typeof data === 'object' &&
        data !== null &&
        '__iframeRpc' in data &&
        (data as any).__iframeRpc === true
    );
}

function createLogger(debug: boolean, prefix: string) {
    return {
        log: (...args: unknown[]) => {
            if (debug) console.log(`[${prefix}]`, ...args);
        },
        error: (...args: unknown[]) => {
            if (debug) console.error(`[${prefix}]`, ...args);
        },
    };
}

// ============================================================================
// Core Bridge Implementation
// ============================================================================

interface PendingRequest {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timeoutId: ReturnType<typeof setTimeout>;
}

type CallProxy<T extends MethodContract> = {
    [K in keyof T]: T[K] extends (...args: infer A) => infer R
    ? (...args: A) => Promise<UnwrapPromise<R>>
    : never;
};

export interface Bridge<
    TLocal extends MethodContract,
    TRemote extends MethodContract
> {
    /** Proxy object to call remote methods with full type safety */
    call: CallProxy<TRemote>;

    /** Fire-and-forget call (no response expected) */
    notify: <K extends VoidMethods<TRemote>>(
        method: K,
        ...args: Parameters<TRemote[K]>
    ) => void;

    /** Destroy the bridge and clean up resources */
    destroy: () => void;

    /** Check if the bridge is still active */
    isActive: () => boolean;
}

function createBridge<
    TLocal extends MethodContract,
    TRemote extends MethodContract
>(
    target: Window,
    handlers: TLocal,
    options: Required<BridgeOptions>,
    side: 'parent' | 'iframe'
): Bridge<TLocal, TRemote> {
    const pendingRequests = new Map<string, PendingRequest>();
    let isDestroyed = false;
    const logger = createLogger(options.debug, `iframe-rpc:${side}`);

    // Handle incoming messages
    const handleMessage = (event: MessageEvent) => {
        if (isDestroyed) return;

        const data = event.data;
        if (!isRpcMessage(data)) return;
        if (data.channel !== options.channel) return;

        logger.log('Received message:', data);

        switch (data.type) {
            case MESSAGE_TYPE.REQUEST:
                handleRequest(data as RequestMessage, event.source as Window);
                break;
            case MESSAGE_TYPE.RESPONSE:
                handleResponse(data as ResponseMessage);
                break;
            case MESSAGE_TYPE.ERROR:
                handleError(data as ErrorMessage);
                break;
            case MESSAGE_TYPE.FIRE_AND_FORGET:
                handleFireAndForget(data as FireAndForgetMessage);
                break;
        }
    };

    const handleRequest = async (message: RequestMessage, source: Window) => {
        const { id, method, args } = message;
        const handler = handlers[method as keyof TLocal];

        if (!handler) {
            sendError(source, id, new RpcMethodNotFoundError(method));
            return;
        }

        try {
            const result = await (handler as AnyMethod)(...args);
            sendResponse(source, id, result);
        } catch (error) {
            sendError(source, id, error instanceof Error ? error : new Error(String(error)));
        }
    };

    const handleResponse = (message: ResponseMessage) => {
        const pending = pendingRequests.get(message.id);
        if (!pending) {
            logger.error('No pending request for response:', message.id);
            return;
        }

        clearTimeout(pending.timeoutId);
        pendingRequests.delete(message.id);
        pending.resolve(message.result);
    };

    const handleError = (message: ErrorMessage) => {
        const pending = pendingRequests.get(message.id);
        if (!pending) {
            logger.error('No pending request for error:', message.id);
            return;
        }

        clearTimeout(pending.timeoutId);
        pendingRequests.delete(message.id);
        pending.reject(
            new RpcError(message.error.message, message.error.code, message.error.stack)
        );
    };

    const handleFireAndForget = (message: FireAndForgetMessage) => {
        const handler = handlers[message.method as keyof TLocal];
        if (!handler) {
            logger.error('Handler not found for fire-and-forget:', message.method);
            return;
        }

        try {
            (handler as AnyMethod)(...message.args);
        } catch (error) {
            logger.error('Error in fire-and-forget handler:', error);
        }
    };

    const sendMessage = (targetWindow: Window, message: RpcMessage) => {
        logger.log('Sending message:', message);
        targetWindow.postMessage(message, options.targetOrigin);
    };

    const sendResponse = (targetWindow: Window, id: string, result: unknown) => {
        const message: ResponseMessage = {
            __iframeRpc: true,
            type: MESSAGE_TYPE.RESPONSE,
            channel: options.channel,
            id,
            result,
        };
        sendMessage(targetWindow, message);
    };

    const sendError = (targetWindow: Window, id: string, error: Error) => {
        const message: ErrorMessage = {
            __iframeRpc: true,
            type: MESSAGE_TYPE.ERROR,
            channel: options.channel,
            id,
            error: {
                message: error.message,
                ...(error instanceof RpcError && error.code ? { code: error.code } : {}),
                ...(error.stack ? { stack: error.stack } : {}),
            },
        };
        sendMessage(targetWindow, message);
    };

    const callMethod = <K extends keyof TRemote>(
        method: K,
        args: unknown[]
    ): Promise<UnwrapPromise<ReturnType<TRemote[K]>>> => {
        if (isDestroyed) {
            return Promise.reject(new RpcError('Bridge has been destroyed', 'DESTROYED'));
        }

        return new Promise((resolve, reject) => {
            const id = generateId();

            const timeoutId = setTimeout(() => {
                pendingRequests.delete(id);
                reject(new RpcTimeoutError(String(method), options.timeout));
            }, options.timeout);

            pendingRequests.set(id, {
                resolve: resolve as (value: unknown) => void,
                reject,
                timeoutId
            });

            const message: RequestMessage = {
                __iframeRpc: true,
                type: MESSAGE_TYPE.REQUEST,
                channel: options.channel,
                id,
                method: method as string,
                args,
            };

            sendMessage(target, message);
        });
    };

    const notify = <K extends VoidMethods<TRemote>>(
        method: K,
        ...args: Parameters<TRemote[K]>
    ) => {
        if (isDestroyed) {
            logger.error('Cannot notify: bridge has been destroyed');
            return;
        }

        const message: FireAndForgetMessage = {
            __iframeRpc: true,
            type: MESSAGE_TYPE.FIRE_AND_FORGET,
            channel: options.channel,
            method: method as string,
            args,
        };

        sendMessage(target, message);
    };

    // Create call proxy with type safety
    const call = new Proxy({} as CallProxy<TRemote>, {
        get(_, prop: string) {
            return (...args: unknown[]) => callMethod(prop as keyof TRemote, args);
        },
    });

    // Set up message listener
    window.addEventListener('message', handleMessage);

    return {
        call,
        notify,
        destroy: () => {
            isDestroyed = true;
            window.removeEventListener('message', handleMessage);

            // Reject all pending requests
            for (const [id, pending] of pendingRequests) {
                clearTimeout(pending.timeoutId);
                pending.reject(new RpcError('Bridge destroyed', 'DESTROYED'));
            }
            pendingRequests.clear();

            logger.log('Bridge destroyed');
        },
        isActive: () => !isDestroyed,
    };
}

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

    const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
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

    const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
    return createBridge<TLocal, TRemote>(
        window.parent,
        handlers,
        mergedOptions,
        'iframe'
    );
}

// ============================================================================
// Type Helpers for Contract Definition
// ============================================================================

/**
 * Helper type to define RPC method contracts
 * Ensures all methods are properly typed
 */
export type DefineContract<T extends MethodContract> = T;

/**
 * Extract parameter types from a method contract
 */
export type ParamsOf<T extends MethodContract, K extends keyof T> = Parameters<T[K]>;

/**
 * Extract return type from a method contract
 */
export type ReturnOf<T extends MethodContract, K extends keyof T> = UnwrapPromise<ReturnType<T[K]>>;

// ============================================================================
// Re-exports
// ============================================================================

export { MESSAGE_TYPE };
export type {
    MethodContract,
    CallProxy,
    RpcMessage,
    RequestMessage,
    ResponseMessage,
    ErrorMessage,
    FireAndForgetMessage,
};