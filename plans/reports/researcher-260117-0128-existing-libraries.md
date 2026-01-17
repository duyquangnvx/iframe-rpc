# Research Report: Existing Window-Iframe Communication Libraries

## Executive Summary

Analysis of 5 major libraries for window-iframe communication reveals strong patterns for type-safe RPC implementations. Penpal and kkRPC lead in TypeScript support, while Comlink dominates adoption. Key gaps exist in micro-frontend-specific features and comprehensive type inference.

## Library Comparison

| Library | Downloads/wk | Bundle Size | TypeScript | Bi-directional | Last Update |
|---------|--------------|-------------|------------|----------------|-------------|
| **Comlink** | 1,090,452 | ~1.1kB brotli | Best-effort | Yes | Nov 2024 |
| **Penpal** | 151,071 | ~2kB gzip | Native | Yes | Apr 2025 |
| **iframe-resizer** | 314,793 | ~15kB | @types | Limited | Active |
| **Postmate** | 17,553 | ~1.6kB gzip | @types | Yes | Oct 2019 (stale) |
| **kkRPC** | ~5,000 | Unknown | Native | Yes | 2025 |

## Detailed Analysis

### 1. Penpal (Recommended Reference)

**Pros:**
- Native TypeScript with full generics support
- Clean messenger-based architecture (WindowMessenger, WorkerMessenger)
- Promise-based method calls with proper error handling
- Supports iframes, workers, and windows
- Active development (v7.0.0 in March 2025)
- Zero dependencies

**Cons:**
- Type inference requires manual generic specification
- No built-in request timeout handling
- Migration complexity between major versions

**Key API Pattern:**
```typescript
const connection = connect<RemoteMethods>({
  messenger: new WindowMessenger({ remoteWindow: iframe.contentWindow }),
  methods: { localMethod: () => {} }
});
const remote = await connection.promise;
```

### 2. Comlink (Most Popular)

**Pros:**
- Extremely small (~1.1kB)
- ES6 Proxy-based API feels native
- Excellent for Web Workers
- Large community and Google backing

**Cons:**
- TypeScript types are "best-effort" - may need casting
- iframe support via `windowEndpoint()` wrapper (secondary use case)
- Cannot auto-serialize DOM elements, Events
- Primary focus is workers, not iframes

**Key API Pattern:**
```typescript
// Child
Comlink.expose(obj);
// Parent
const remote = Comlink.wrap<T>(Comlink.windowEndpoint(iframe.contentWindow));
```

### 3. Postmate (Legacy)

**Pros:**
- Simple API with clear handshake protocol
- Lightweight (~1.6kB)
- Well-documented

**Cons:**
- **Not actively maintained (last update 2019)**
- No native TypeScript (requires @types)
- Limited error handling - thrown errors don't propagate properly
- iframe-only (no workers)

### 4. iframe-resizer

**Pros:**
- Mature and battle-tested
- Great for sizing/layout concerns
- Framework adapters (React, Vue, Angular)

**Cons:**
- Primary focus is resizing, not RPC
- Messaging is simplified, not full RPC
- Version 5 licensing changes (commercial license)

### 5. kkRPC (Newer Alternative)

**Pros:**
- Native TypeScript with full inference
- Multi-transport (stdio, HTTP, WebSocket, postMessage)
- Supports nested method calls and callbacks
- Error preservation across boundaries

**Cons:**
- Smaller community
- More complex API for simple use cases
- Bundle size not optimized

## Architectural Patterns

### Common Patterns (Adopt)
1. **Promise-based methods** - All modern libraries use promises
2. **Handshake protocol** - Connection establishment before communication
3. **Origin validation** - Security via `targetOrigin` / `allowedOrigins`
4. **Messenger abstraction** - Separation of transport from RPC logic

### Anti-patterns (Avoid)
1. **Synchronous APIs** - Block UI thread
2. **No timeout handling** - Methods can hang forever
3. **Implicit any types** - Lose type safety benefits

## Gaps and Opportunities

### Identified Gaps
1. **Schema-first approach** - No library offers contract-first API definition
2. **Request timeout** - Most lack built-in timeout with configurable defaults
3. **Retry logic** - No built-in retry for failed requests
4. **Message batching** - No optimization for high-frequency calls
5. **DevTools integration** - Limited debugging capabilities
6. **Micro-frontend specific** - No module federation awareness

### Improvement Opportunities
1. Better TypeScript inference without manual generic specification
2. Built-in request/response correlation with timeouts
3. Connection state management (connecting, connected, disconnected)
4. Event emitter pattern alongside RPC
5. Structured error types with codes

## Recommendations for Our Library

### Must Have
- Native TypeScript with inference (like kkRPC)
- Promise-based RPC with correlation IDs
- Configurable timeouts per method
- Origin validation with allowlist
- Bidirectional communication

### Should Have
- Connection lifecycle events
- Automatic reconnection
- Structured error types
- Debug mode with logging

### Nice to Have
- Message batching for performance
- Schema validation at runtime
- DevTools extension

### API Design Inspiration

Take from **Penpal**: Messenger abstraction, clean connect() API
Take from **Comlink**: Small bundle size goal, Proxy-based feel
Take from **kkRPC**: Full TypeScript inference, nested methods

```typescript
// Proposed API style
const bridge = createBridge<LocalAPI, RemoteAPI>({
  target: iframe.contentWindow,
  origin: 'https://trusted.com',
  methods: localMethods,
  timeout: 5000
});

await bridge.connect();
const result = await bridge.remote.someMethod(arg);
```

## Sources

- [Penpal GitHub](https://github.com/Aaronius/penpal)
- [Comlink GitHub](https://github.com/GoogleChromeLabs/comlink)
- [Postmate GitHub](https://github.com/dollarshaveclub/postmate)
- [kkRPC GitHub](https://github.com/kunkunsh/kkrpc)
- [iframe-resizer](https://iframe-resizer.com/)
- [npm trends comparison](https://npmtrends.com/comlink-vs-penpal-vs-postmate)
