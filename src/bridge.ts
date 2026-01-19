/**
 * Core bridge implementation for bidirectional RPC communication
 */

import type { AnyMethod, CallProxy, MethodContract, UnwrapPromise, VoidMethods } from './types';
import type { ResolvedBridgeOptions } from './config';
import {
    MESSAGE_TYPE,
    type RequestMessage,
    type ResponseMessage,
    type ErrorMessage,
    type FireAndForgetMessage,
    type RpcMessage,
} from './messages';
import { RpcError, RpcMethodNotFoundError, RpcTimeoutError } from './errors';
import { generateId, isRpcMessage, createLogger, sleep } from './utils';

/** Pending request tracking */
interface PendingRequest {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timeoutId: ReturnType<typeof setTimeout>;
}

/**
 * Bridge interface for bidirectional RPC communication
 * @typeParam _TLocal - Local method handlers (unused, retained for API symmetry)
 * @typeParam TRemote - Remote methods available to call
 */
export interface Bridge<
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _TLocal extends MethodContract,
    TRemote extends MethodContract
> {
    /** Proxy object to call remote methods with full type safety */
    call: CallProxy<TRemote>;

    /** Call remote method by name (for dynamic method calls) */
    invoke: <K extends keyof TRemote>(
        method: K,
        ...args: Parameters<TRemote[K]>
    ) => Promise<UnwrapPromise<ReturnType<TRemote[K]>>>;

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

/**
 * Create a bridge for RPC communication
 * @internal
 */
export function createBridge<
    TLocal extends MethodContract,
    TRemote extends MethodContract
>(
    target: Window,
    handlers: TLocal,
    options: ResolvedBridgeOptions,
    side: 'parent' | 'iframe'
): Bridge<TLocal, TRemote> {
    const pendingRequests = new Map<string, PendingRequest>();
    let isDestroyed = false;
    const logger = createLogger(options.debug, `iframe-rpc:${side}`);

    // Handle incoming messages
    const handleMessage = (event: MessageEvent) => {
        if (isDestroyed) return;

        // Validate origin when targetOrigin is specified
        if (options.targetOrigin !== '*' && event.origin !== options.targetOrigin) {
            logger.log('Rejected message from untrusted origin:', event.origin);
            return;
        }

        const data = event.data;
        if (!isRpcMessage(data)) return;
        if (data.channel !== options.channel) return;

        logger.log('Received message:', data);

        switch (data.type) {
            case MESSAGE_TYPE.REQUEST:
                if (!event.source) {
                    logger.error('Request received with null source');
                    return;
                }
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

        // Handle both sync and async handlers, catching any rejections
        Promise.resolve()
            .then(() => (handler as AnyMethod)(...message.args))
            .catch((error) => logger.error('Error in fire-and-forget handler:', error));
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
                // Only include stack traces if explicitly enabled (security consideration)
                ...(options.includeStackTraces && error.stack ? { stack: error.stack } : {}),
            },
        };
        sendMessage(targetWindow, message);
    };

    // Execute a single RPC call (without retry)
    const executeCall = <K extends keyof TRemote>(
        method: K,
        args: unknown[]
    ): Promise<UnwrapPromise<ReturnType<TRemote[K]>>> => {
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

    // Calculate delay for retry attempt with exponential backoff
    const calculateRetryDelay = (attempt: number): number => {
        const { retryDelay, retryBackoff, maxRetryDelay } = options.retry;
        const delay = retryDelay * Math.pow(retryBackoff, attempt);
        return Math.min(delay, maxRetryDelay);
    };

    const callMethod = <K extends keyof TRemote>(
        method: K,
        args: unknown[]
    ): Promise<UnwrapPromise<ReturnType<TRemote[K]>>> => {
        if (isDestroyed) {
            return Promise.reject(new RpcError('Bridge has been destroyed', 'DESTROYED'));
        }

        const { maxRetries, isRetryable } = options.retry;

        // If no retries configured, execute directly
        if (maxRetries <= 0) {
            return executeCall(method, args);
        }

        // Execute with retry logic
        return (async () => {
            let lastError: Error | undefined;

            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                try {
                    return await executeCall(method, args);
                } catch (error) {
                    lastError = error instanceof Error ? error : new Error(String(error));

                    // Check if we should retry
                    const isLastAttempt = attempt === maxRetries;
                    const shouldRetry = !isLastAttempt && isRetryable(lastError);

                    if (!shouldRetry) {
                        throw lastError;
                    }

                    // Calculate delay and wait before retrying
                    const delay = calculateRetryDelay(attempt);
                    logger.log(
                        `Retry ${attempt + 1}/${maxRetries} for "${String(method)}" after ${delay}ms`,
                        `(${lastError.message})`
                    );
                    await sleep(delay);

                    // Check if bridge was destroyed during the delay
                    if (isDestroyed) {
                        throw new RpcError('Bridge has been destroyed', 'DESTROYED');
                    }
                }
            }

            // Should not reach here, but TypeScript needs this
            throw lastError ?? new RpcError('Unknown error during retry', 'UNKNOWN');
        })();
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
        get(_, prop) {
            // Handle Symbol properties (e.g., Symbol.toStringTag, Symbol.iterator)
            if (typeof prop === 'symbol') return undefined;
            return (...args: unknown[]) => callMethod(prop as keyof TRemote, args);
        },
    });

    // Set up message listener
    window.addEventListener('message', handleMessage);

    return {
        call,
        invoke: <K extends keyof TRemote>(method: K, ...args: Parameters<TRemote[K]>) =>
            callMethod(method, args),
        notify,
        destroy: () => {
            isDestroyed = true;
            window.removeEventListener('message', handleMessage);

            // Reject all pending requests
            for (const [, pending] of pendingRequests) {
                clearTimeout(pending.timeoutId);
                pending.reject(new RpcError('Bridge destroyed', 'DESTROYED'));
            }
            pendingRequests.clear();

            logger.log('Bridge destroyed');
        },
        isActive: () => !isDestroyed,
    };
}
