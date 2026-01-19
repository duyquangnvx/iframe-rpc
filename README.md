# @duyquangnvx/iframe-rpc

Type-safe bidirectional RPC communication between parent window and iframe.

## Features

- **Type-safe RPC**: Full TypeScript inference for method parameters and return types
- **Bidirectional**: Both parent and iframe can call methods on each other
- **Fire-and-forget**: Support for one-way notifications without waiting for response
- **Timeout handling**: Configurable timeouts with automatic cleanup
- **Channel isolation**: Multiple independent bridges on the same page
- **Zero dependencies**: Lightweight with no runtime dependencies

## Installation

```bash
npm install @duyquangnvx/iframe-rpc
# or
pnpm add @duyquangnvx/iframe-rpc
# or
yarn add @duyquangnvx/iframe-rpc
```

## Quick Start

### 1. Define your API contracts

```typescript
// Shared types (e.g., shared/types.ts)
type ParentMethods = {
  getUser: (id: string) => Promise<{ name: string; age: number }>;
  notify: (message: string) => void;
};

type IframeMethods = {
  initialize: (config: { theme: string }) => Promise<void>;
  getStatus: () => Promise<'ready' | 'loading'>;
};
```

### 2. Set up the parent window

```typescript
import { createParentBridge } from '@duyquangnvx/iframe-rpc';

const iframe = document.getElementById('my-iframe') as HTMLIFrameElement;

const bridge = createParentBridge<ParentMethods, IframeMethods>(iframe, {
  getUser: async (id) => ({ name: 'John', age: 30 }),
  notify: (message) => console.log('Notification:', message),
});

// Call iframe methods with full type safety
const status = await bridge.call.getStatus();
await bridge.call.initialize({ theme: 'dark' });
```

### 3. Set up the iframe

```typescript
import { createIframeBridge } from '@duyquangnvx/iframe-rpc';

const bridge = createIframeBridge<IframeMethods, ParentMethods>({
  initialize: async (config) => {
    document.body.className = config.theme;
  },
  getStatus: async () => 'ready',
});

// Call parent methods with full type safety
const user = await bridge.call.getUser('123');
bridge.notify('logEvent', 'iframe-loaded'); // Fire-and-forget
```

## API Reference

### `createParentBridge<TLocal, TRemote>(iframe, handlers, options?)`

Creates a bridge in the parent window to communicate with an iframe.

**Parameters:**
- `iframe`: `HTMLIFrameElement` - The iframe to communicate with
- `handlers`: `TLocal` - Object containing methods the iframe can call
- `options?`: `BridgeOptions` - Configuration options

**Returns:** `Bridge<TLocal, TRemote>`

### `createIframeBridge<TLocal, TRemote>(handlers, options?)`

Creates a bridge in the iframe to communicate with the parent window.

**Parameters:**
- `handlers`: `TLocal` - Object containing methods the parent can call
- `options?`: `BridgeOptions` - Configuration options

**Returns:** `Bridge<TLocal, TRemote>`

### `BridgeOptions`

```typescript
interface BridgeOptions {
  timeout?: number;       // RPC timeout in ms (default: 30000)
  targetOrigin?: string;  // postMessage target origin (default: '*')
  channel?: string;       // Channel name for isolation (default: 'default')
  debug?: boolean;        // Enable debug logging (default: false)
  retry?: RetryOptions;   // Retry configuration for failed calls
}

interface RetryOptions {
  maxRetries?: number;    // Max retry attempts (default: 0 - no retries)
  retryDelay?: number;    // Initial delay between retries in ms (default: 1000)
  retryBackoff?: number;  // Backoff multiplier (default: 2)
  maxRetryDelay?: number; // Max delay cap in ms (default: 30000)
  isRetryable?: (error: Error) => boolean;  // Custom retry condition
}
```

### `Bridge<TLocal, TRemote>`

```typescript
interface Bridge<TLocal, TRemote> {
  call: CallProxy<TRemote>;           // Type-safe proxy for calling remote methods
  invoke: (method, ...args) => Promise; // Call by method name (for dynamic calls)
  notify: (method, ...args) => void;  // Fire-and-forget calls
  destroy: () => void;                // Clean up and stop listening
  isActive: () => boolean;            // Check if bridge is active
}
```

### Calling Methods

Two ways to call remote methods:

```typescript
// 1. Proxy API (recommended) - best IDE support
const user = await bridge.call.getUser('123');

// 2. Invoke API - for dynamic method names
const methodName = 'getUser';
const user = await bridge.invoke(methodName, '123');
```

Both are fully type-safe. Use `call` for static calls, `invoke` when method name is dynamic.

## Error Handling

The library provides typed error classes:

```typescript
import { RpcError, RpcTimeoutError, RpcMethodNotFoundError } from '@duyquangnvx/iframe-rpc';

try {
  await bridge.call.someMethod();
} catch (error) {
  if (error instanceof RpcTimeoutError) {
    console.log('Call timed out');
  } else if (error instanceof RpcMethodNotFoundError) {
    console.log('Method not found on remote side');
  } else if (error instanceof RpcError) {
    console.log('RPC error:', error.message, error.code);
  }
}
```

## Retry Configuration

Configure automatic retries for failed calls with exponential backoff:

```typescript
const bridge = createParentBridge(iframe, handlers, {
  timeout: 5000,
  retry: {
    maxRetries: 3,           // Retry up to 3 times
    retryDelay: 1000,        // Start with 1s delay
    retryBackoff: 2,         // Double delay each retry (1s, 2s, 4s)
    maxRetryDelay: 10000,    // Cap delay at 10s
  },
});
```

By default, only timeout errors are retried. Customize with `isRetryable`:

```typescript
const bridge = createParentBridge(iframe, handlers, {
  retry: {
    maxRetries: 3,
    isRetryable: (error) => {
      // Retry on timeout or specific error codes
      if (error instanceof RpcTimeoutError) return true;
      if (error instanceof RpcError && error.code === 'TEMPORARY_ERROR') return true;
      return false;
    },
  },
});
```

## Channel Isolation

Run multiple independent bridges on the same page:

```typescript
// Widget A
const bridgeA = createParentBridge(iframeA, handlersA, { channel: 'widget-a' });

// Widget B (won't interfere with Widget A)
const bridgeB = createParentBridge(iframeB, handlersB, { channel: 'widget-b' });
```

## Security Considerations

By default, `targetOrigin` is set to `'*'` which allows communication with any origin. For production, you should specify the exact origin:

```typescript
const bridge = createParentBridge(iframe, handlers, {
  targetOrigin: 'https://trusted-domain.com',
});
```

## License

MIT
