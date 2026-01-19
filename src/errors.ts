/**
 * Error classes for RPC operations
 */

/** Base error class for all RPC errors */
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

/** Error thrown when an RPC call times out */
export class RpcTimeoutError extends RpcError {
    constructor(method: string, timeout: number) {
        super(`RPC call to "${method}" timed out after ${timeout}ms`, 'TIMEOUT');
        this.name = 'RpcTimeoutError';
    }
}

/** Error thrown when a called method is not found on the remote side */
export class RpcMethodNotFoundError extends RpcError {
    constructor(method: string) {
        super(`Method "${method}" not found`, 'METHOD_NOT_FOUND');
        this.name = 'RpcMethodNotFoundError';
    }
}
