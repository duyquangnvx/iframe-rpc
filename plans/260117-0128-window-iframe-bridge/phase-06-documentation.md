# Phase 6: Documentation

**Priority**: Medium
**Status**: Pending
**Estimated Time**: 2 hours

## Context Links

- **Parent Plan**: [plan.md](./plan.md)
- **Previous Phase**: [Phase 5: Testing](./phase-05-testing.md)
- **All Phases**:
  - [Phase 1: Project Setup](./phase-01-project-setup.md)
  - [Phase 2: Core Types](./phase-02-core-types.md)
  - [Phase 3: Parent Bridge](./phase-03-parent-bridge.md)
  - [Phase 4: Child Bridge](./phase-04-child-bridge.md)

## Overview

Create comprehensive documentation including README with quick start guide, API reference, examples, and migration guidance. Documentation should be clear enough for developers to integrate the library without reading source code.

## Key Insights from Research

1. **Quick start is crucial** - developers want working code in < 5 minutes
2. **Type-first docs** - show contract definition prominently
3. **Security warnings** - emphasize origin validation
4. **Real-world examples** - micro-frontend use cases
5. **API tables** - scannable reference format

## Requirements

### Functional Requirements
- [ ] README with quick start guide
- [ ] Installation instructions
- [ ] Basic usage examples (parent and child)
- [ ] API reference for all public classes
- [ ] Configuration options documentation
- [ ] Error handling guide
- [ ] Security best practices
- [ ] TypeScript usage examples
- [ ] Framework integration examples (optional)

### Non-Functional Requirements
- [ ] README is < 500 lines
- [ ] All code examples are tested/verified
- [ ] Consistent formatting
- [ ] Clear section navigation
- [ ] Mobile-friendly formatting

## Architecture

```
Documentation Structure
├── README.md
│   ├── Quick Start
│   ├── Installation
│   ├── Basic Usage
│   ├── API Reference
│   ├── Configuration
│   ├── Error Handling
│   ├── Security
│   └── TypeScript
└── (optional)
    ├── examples/
    │   ├── basic/
    │   ├── micro-frontend/
    │   └── bi-directional/
    └── CONTRIBUTING.md
```

## Related Code Files

### Files to Create
| File | Purpose |
|------|---------|
| `README.md` | Main documentation |
| `LICENSE` | MIT license |

### Files to Modify
| File | Changes |
|------|---------|
| `package.json` | Add repository, homepage URLs |

## Implementation Steps

### Step 1: Create README (1.5 hours)

**README.md content:**
```markdown
# window-iframe-bridge

Type-safe window-iframe communication library for micro-frontends.

[![npm version](https://img.shields.io/npm/v/window-iframe-bridge.svg)](https://www.npmjs.com/package/window-iframe-bridge)
[![bundle size](https://img.shields.io/bundlephobia/minzip/window-iframe-bridge)](https://bundlephobia.com/package/window-iframe-bridge)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)

## Features

- **Type-safe RPC** - Full TypeScript inference for request/response types
- **Contract-first** - Define your API contract, get automatic type checking
- **Bi-directional** - Parent can call child and child can call parent
- **Lightweight** - ~2KB gzipped, zero dependencies
- **Secure** - Origin validation, no wildcards in production
- **Timeouts** - Configurable per-call timeouts with automatic cleanup
- **Framework-agnostic** - Works with React, Vue, Angular, or vanilla JS

## Installation

```bash
npm install window-iframe-bridge
# or
pnpm add window-iframe-bridge
# or
yarn add window-iframe-bridge
```

## Quick Start

### 1. Define your contract

```typescript
import type { BridgeContract } from 'window-iframe-bridge';

// Methods the child iframe exposes
interface ChildAPI extends BridgeContract {
  'user/get': {
    request: { id: string };
    response: { name: string; email: string };
  };
  'user/update': {
    request: { id: string; name: string };
    response: { success: boolean };
  };
}
```

### 2. Setup parent (main window)

```typescript
import { ParentBridge } from 'window-iframe-bridge';

const iframe = document.getElementById('my-iframe') as HTMLIFrameElement;

const bridge = new ParentBridge<{}, ChildAPI>({
  target: iframe,
  origin: 'https://child.example.com', // Required: exact origin
  timeout: 5000, // Optional: default timeout
});

// Connect and start making calls
await bridge.connect();

const user = await bridge.call('user/get', { id: '123' });
console.log(user.name, user.email); // Fully typed!
```

### 3. Setup child (iframe)

```typescript
import { ChildBridge } from 'window-iframe-bridge';

const bridge = new ChildBridge<ChildAPI, {}>({
  origin: 'https://parent.example.com', // Required: exact origin
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

// Child automatically connects when parent sends handshake
```

## API Reference

### ParentBridge

Creates a bridge in the parent window to communicate with an iframe.

```typescript
new ParentBridge<LocalContract, RemoteContract>(config)
```

#### Config Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `target` | `HTMLIFrameElement \| Window` | required | Target iframe or window |
| `origin` | `string \| string[]` | required | Allowed origin(s) |
| `timeout` | `number` | `10000` | Default timeout in ms |
| `handshakeTimeout` | `number` | `5000` | Handshake timeout in ms |
| `handshakeRetries` | `number` | `3` | Number of retry attempts |
| `retryDelay` | `number` | `1000` | Delay between retries |
| `methods` | `object` | `{}` | Methods for bi-directional calls |
| `debug` | `boolean` | `false` | Enable debug logging |
| `bridgeId` | `string` | `undefined` | Unique ID for multi-bridge |

#### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `connect()` | `Promise<void>` | Establish connection with child |
| `call(method, payload, options?)` | `Promise<Response>` | Call a method on child |
| `isConnected()` | `boolean` | Check connection status |
| `getState()` | `ConnectionState` | Get detailed connection state |
| `getRemoteMethods()` | `string[]` | Methods available on child |
| `destroy()` | `void` | Cleanup and disconnect |

### ChildBridge

Creates a bridge inside the iframe to respond to parent requests.

```typescript
new ChildBridge<LocalContract, RemoteContract>(config)
```

#### Config Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `origin` | `string \| string[]` | required | Allowed parent origin(s) |
| `methods` | `object` | required | Handler implementations |
| `timeout` | `number` | `10000` | Default timeout for calls to parent |
| `debug` | `boolean` | `false` | Enable debug logging |
| `bridgeId` | `string` | `undefined` | Unique ID for multi-bridge |

#### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `call(method, payload, options?)` | `Promise<Response>` | Call parent (bi-directional) |
| `isConnected()` | `boolean` | Check connection status |
| `getState()` | `ConnectionState` | Get detailed connection state |
| `getParentOrigin()` | `string \| null` | Connected parent's origin |
| `getParentMethods()` | `string[]` | Methods available on parent |
| `destroy()` | `void` | Cleanup and stop listening |

### BridgeError

Custom error class with structured error information.

```typescript
import { BridgeError, BridgeErrorCode } from 'window-iframe-bridge';

try {
  await bridge.call('method', payload);
} catch (error) {
  if (error instanceof BridgeError) {
    switch (error.code) {
      case BridgeErrorCode.TIMEOUT:
        // Handle timeout
        break;
      case BridgeErrorCode.METHOD_NOT_FOUND:
        // Handle missing method
        break;
      case BridgeErrorCode.HANDLER_ERROR:
        // Handle handler error
        break;
    }
  }
}
```

#### Error Codes

| Code | Description |
|------|-------------|
| `BRIDGE_TIMEOUT` | Request timed out |
| `BRIDGE_METHOD_NOT_FOUND` | Method not registered on remote |
| `BRIDGE_HANDLER_ERROR` | Handler threw an error |
| `BRIDGE_INVALID_ORIGIN` | Origin validation failed |
| `BRIDGE_NOT_CONNECTED` | Bridge not connected |
| `BRIDGE_HANDSHAKE_FAILED` | Connection handshake failed |
| `BRIDGE_DESTROYED` | Bridge was destroyed |

## Advanced Usage

### Bi-directional Communication

Both parent and child can call each other's methods.

```typescript
// Parent contract (methods parent exposes)
interface ParentAPI extends BridgeContract {
  'auth/getToken': {
    request: {};
    response: { token: string };
  };
}

// Child contract (methods child exposes)
interface ChildAPI extends BridgeContract {
  'data/fetch': {
    request: { query: string };
    response: { results: unknown[] };
  };
}

// Parent side
const parent = new ParentBridge<ParentAPI, ChildAPI>({
  target: iframe,
  origin: 'https://child.example.com',
  methods: {
    'auth/getToken': async () => {
      return { token: await getAuthToken() };
    },
  },
});

// Child side
const child = new ChildBridge<ChildAPI, ParentAPI>({
  origin: 'https://parent.example.com',
  methods: {
    'data/fetch': async ({ query }) => {
      // Call parent to get auth token
      const { token } = await child.call('auth/getToken', {});

      const results = await fetchWithAuth(query, token);
      return { results };
    },
  },
});
```

### Per-call Timeout

Override the default timeout for specific calls.

```typescript
// Use longer timeout for slow operations
const data = await bridge.call('data/export', { format: 'csv' }, {
  timeout: 60000, // 60 seconds
});
```

### Multiple Origins

Allow connections from multiple trusted origins.

```typescript
const bridge = new ParentBridge({
  target: iframe,
  origin: [
    'https://app.example.com',
    'https://staging.example.com',
    'http://localhost:3000', // development only
  ],
});
```

### Connection State

Monitor connection state changes.

```typescript
// Check state
console.log(bridge.getState()); // 'disconnected' | 'connecting' | 'connected' | 'destroyed'

// Wait for connection
if (!bridge.isConnected()) {
  await bridge.connect();
}
```

### Cleanup

Always destroy bridges when no longer needed.

```typescript
// In React
useEffect(() => {
  const bridge = new ParentBridge(config);
  bridge.connect();

  return () => {
    bridge.destroy(); // Cleanup on unmount
  };
}, []);
```

## Security

### Always Specify Exact Origins

```typescript
// GOOD - Exact origin
const bridge = new ParentBridge({
  target: iframe,
  origin: 'https://trusted.example.com',
});

// BAD - Wildcard (insecure!)
const bridge = new ParentBridge({
  target: iframe,
  origin: '*', // Don't do this in production!
});
```

### Validate Data

Even with type safety, validate data at runtime for untrusted sources.

```typescript
// Optional: Use Zod for runtime validation
import { z } from 'zod';

const UserSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
});

const handlers = {
  'user/update': async (payload) => {
    const validated = UserSchema.parse(payload); // Throws if invalid
    await updateUser(validated);
    return { success: true };
  },
};
```

## TypeScript

### Contract Definition

Define contracts with the `BridgeContract` interface.

```typescript
import type { BridgeContract } from 'window-iframe-bridge';

interface MyContract extends BridgeContract {
  'method/name': {
    request: { /* request payload type */ };
    response: { /* response payload type */ };
  };
}
```

### Type Inference

Request and response types are automatically inferred.

```typescript
// Types are inferred from contract
const result = await bridge.call('user/get', { id: '123' });
//    ^? { name: string; email: string }

// TypeScript error if payload is wrong
await bridge.call('user/get', { wrong: 'field' });
//                             ^ Error: 'wrong' does not exist
```

### Generic Constraints

Use both local and remote contract types.

```typescript
const bridge = new ParentBridge<
  ParentContract, // Methods this bridge exposes
  ChildContract   // Methods available on remote
>({...});
```

## Browser Support

- Chrome 60+
- Firefox 55+
- Safari 11+
- Edge 79+

Requires `postMessage` and `Promise` support (ES2020+).

## Comparison

| Feature | window-iframe-bridge | Penpal | Comlink |
|---------|---------------------|--------|---------|
| Type Safety | Native TS | Native TS | Best-effort |
| Bundle Size | ~2KB | ~2KB | ~1KB |
| Bi-directional | Yes | Yes | Yes |
| Timeout Support | Yes | No | No |
| Origin Validation | Required | Optional | Optional |
| Retry Logic | Built-in | No | No |

## License

MIT
```

### Step 2: Create LICENSE (5 min)

**LICENSE content:**
```
MIT License

Copyright (c) 2026

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Step 3: Update package.json (10 min)

Add repository and homepage URLs:

```json
{
  "repository": {
    "type": "git",
    "url": "git+https://github.com/your-org/window-iframe-bridge.git"
  },
  "homepage": "https://github.com/your-org/window-iframe-bridge#readme",
  "bugs": {
    "url": "https://github.com/your-org/window-iframe-bridge/issues"
  }
}
```

### Step 4: Verify Documentation (15 min)

```bash
# Check README renders correctly
# GitHub automatically renders README.md

# Verify all code examples compile
# Create a test file that imports the examples

# Check bundle size claim is accurate
pnpm build
ls -la dist/
```

## Todo List

- [ ] Create `README.md` with full documentation
- [ ] Create `LICENSE` file (MIT)
- [ ] Update `package.json` with repository URLs
- [ ] Verify code examples are accurate
- [ ] Check README renders correctly on GitHub
- [ ] Verify bundle size claim (~2KB)
- [ ] Add badges to README

## Success Criteria

- [ ] README is comprehensive but < 500 lines
- [ ] All code examples are tested and work
- [ ] API reference covers all public methods
- [ ] Security section emphasizes origin validation
- [ ] TypeScript examples show type inference

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Examples don't work | High | Test all examples |
| Missing API docs | Medium | Check exports match docs |
| Bundle size claim wrong | Low | Verify with build |

## Security Considerations

- [ ] Document origin validation requirement
- [ ] Warn against wildcard origins
- [ ] Recommend runtime validation

## Next Steps

After completing this phase:
1. Run final build and tests
2. Verify bundle size
3. Create initial git commit
4. (Optional) Publish to npm
5. (Optional) Create GitHub repository
