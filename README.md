# window-iframe-bridge

Type-safe window-iframe communication library for micro-frontends.

## Features

- **Type-safe**: Full TypeScript support with contract-first API design
- **Bi-directional**: Both parent and child can call methods on each other
- **Zero dependencies**: No external runtime dependencies
- **Secure**: Origin validation and handshake protocol
- **Framework-agnostic**: Works with any JavaScript framework

## Installation

```bash
npm install window-iframe-bridge
# or
pnpm add window-iframe-bridge
# or
yarn add window-iframe-bridge
```

## Quick Start

### 1. Define Your Contract

```typescript
import type { BridgeContract } from 'window-iframe-bridge';

// Methods the child iframe exposes
interface ChildAPI extends BridgeContract {
  'user/get': { request: { id: string }; response: { name: string; email: string } };
  'user/update': { request: { id: string; name: string }; response: { success: boolean } };
}

// Methods the parent exposes (optional, for bi-directional calls)
interface ParentAPI extends BridgeContract {
  'auth/getToken': { request: Record<string, never>; response: { token: string } };
}
```

### 2. Setup Parent Bridge

```typescript
import { ParentBridge } from 'window-iframe-bridge';

const iframe = document.getElementById('child-iframe') as HTMLIFrameElement;

const bridge = new ParentBridge<ParentAPI, ChildAPI>({
  target: iframe,
  origin: 'https://child.example.com',
  // Optional: methods parent exposes to child
  methods: {
    'auth/getToken': async () => ({ token: 'abc123' }),
  },
});

// Wait for connection
await bridge.connect();

// Call child methods with full type safety
const user = await bridge.call('user/get', { id: '123' });
console.log(user.name); // Typed as string
```

### 3. Setup Child Bridge

```typescript
import { ChildBridge } from 'window-iframe-bridge';

const bridge = new ChildBridge<ChildAPI, ParentAPI>({
  origin: 'https://parent.example.com',
  methods: {
    'user/get': async ({ id }) => {
      const user = await fetchUser(id);
      return { name: user.name, email: user.email };
    },
    'user/update': async ({ id, name }) => {
      await updateUser(id, { name });
      return { success: true };
    },
  },
});

// Child can also call parent methods
const { token } = await bridge.call('auth/getToken', {});
```

## API Reference

### ParentBridge

```typescript
new ParentBridge<LocalContract, RemoteContract>(config: ParentBridgeConfig)
```

**Config Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `target` | `HTMLIFrameElement \| Window` | required | Target iframe or window |
| `origin` | `string \| string[]` | required | Allowed origin(s) |
| `methods` | `object` | `{}` | Methods to expose to child |
| `timeout` | `number` | `30000` | Default call timeout (ms) |
| `handshakeTimeout` | `number` | `5000` | Handshake timeout (ms) |
| `handshakeRetries` | `number` | `3` | Number of handshake attempts |
| `debug` | `boolean` | `false` | Enable debug logging |
| `bridgeId` | `string` | `undefined` | Optional bridge identifier |

**Methods:**

- `connect(): Promise<void>` - Connect to the child iframe
- `call<M>(method: M, payload, options?): Promise<Response>` - Call a remote method
- `isConnected(): boolean` - Check if connected
- `getState(): ConnectionState` - Get current state
- `getRemoteMethods(): string[]` - Get available remote methods
- `destroy(): void` - Destroy the bridge

### ChildBridge

```typescript
new ChildBridge<LocalContract, RemoteContract>(config: ChildBridgeConfig)
```

**Config Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `origin` | `string \| string[]` | required | Allowed parent origin(s) |
| `methods` | `object` | required | Methods to expose to parent |
| `timeout` | `number` | `30000` | Default call timeout (ms) |
| `debug` | `boolean` | `false` | Enable debug logging |
| `bridgeId` | `string` | `undefined` | Optional bridge identifier |

**Methods:**

- `call<M>(method: M, payload, options?): Promise<Response>` - Call a parent method
- `isConnected(): boolean` - Check if connected
- `getState(): ConnectionState` - Get current state
- `getParentMethods(): string[]` - Get available parent methods
- `destroy(): void` - Destroy the bridge

### BridgeError

Custom error class with error codes:

```typescript
import { BridgeError, BridgeErrorCode } from 'window-iframe-bridge';

try {
  await bridge.call('user/get', { id: '123' });
} catch (error) {
  if (error instanceof BridgeError) {
    switch (error.code) {
      case BridgeErrorCode.TIMEOUT:
        console.log('Request timed out');
        break;
      case BridgeErrorCode.METHOD_NOT_FOUND:
        console.log('Method not found');
        break;
      case BridgeErrorCode.NOT_CONNECTED:
        console.log('Bridge not connected');
        break;
      // ... other codes
    }
  }
}
```

**Error Codes:**

- `TIMEOUT` - Request timed out
- `METHOD_NOT_FOUND` - Method not registered
- `HANDLER_ERROR` - Handler threw an error
- `INVALID_ORIGIN` - Origin validation failed
- `NOT_CONNECTED` - Bridge not connected
- `HANDSHAKE_FAILED` - Handshake failed
- `DESTROYED` - Bridge has been destroyed
- `UNKNOWN` - Unknown error

## Call Options

Override timeout per-call:

```typescript
const result = await bridge.call('slow/operation', { data }, {
  timeout: 60000, // 60 seconds for this call
});
```

## Security

- Always specify exact origins in production (avoid `"*"`)
- Origins are validated on both parent and child sides
- Handshake ensures both sides are ready before communication
- All messages include correlation IDs for request-response matching

## License

MIT
