# System Architecture

**Last Updated**: 2026-01-17
**Project**: window-iframe-bridge

## Overview

window-iframe-bridge is a lightweight TypeScript library that provides type-safe bidirectional RPC communication between parent windows and iframes using the browser's postMessage API.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      Parent Window                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │               createParentBridge()                   │   │
│  │  ┌───────────┐  ┌───────────┐  ┌────────────────┐  │   │
│  │  │  Handlers │  │Call Proxy │  │ Pending Reqs   │  │   │
│  │  │  (local)  │  │ (remote)  │  │   Map<id>      │  │   │
│  │  └───────────┘  └───────────┘  └────────────────┘  │   │
│  └──────────────────────┬──────────────────────────────┘   │
│                         │ postMessage                       │
└─────────────────────────┼───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                        Iframe                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │               createIframeBridge()                   │   │
│  │  ┌───────────┐  ┌───────────┐  ┌────────────────┐  │   │
│  │  │  Handlers │  │Call Proxy │  │ Pending Reqs   │  │   │
│  │  │  (local)  │  │ (remote)  │  │   Map<id>      │  │   │
│  │  └───────────┘  └───────────┘  └────────────────┘  │   │
│  └──────────────────────┬──────────────────────────────┘   │
│                         │ postMessage                       │
└─────────────────────────┼───────────────────────────────────┘
                          │
                          ▲
                          │
                    (bidirectional)
```

## Message Protocol

### Message Types

```typescript
const MESSAGE_TYPE = {
  REQUEST: 'iframe-rpc:request',
  RESPONSE: 'iframe-rpc:response',
  ERROR: 'iframe-rpc:error',
  FIRE_AND_FORGET: 'iframe-rpc:fire-and-forget',
};
```

### Message Flow

**Request-Response Pattern:**
```
Caller                                   Callee
  │                                         │
  │ ──── REQUEST (id, method, args) ────►  │
  │                                         │
  │ ◄─── RESPONSE (id, result) ──────────  │
  │                                         │
```

**Error Response:**
```
Caller                                   Callee
  │                                         │
  │ ──── REQUEST (id, method, args) ────►  │
  │                                         │
  │ ◄─── ERROR (id, error) ───────────────  │
  │                                         │
```

**Fire-and-Forget:**
```
Caller                                   Callee
  │                                         │
  │ ──── FIRE_AND_FORGET (method, args) ──► │
  │                                         │
  │      (no response expected)             │
```

## Components

### Bridge Factory

The internal `createBridge()` function creates a bridge instance with:
- Message listener registration
- Request/response correlation
- Timeout handling
- Proxy-based call interface

### Call Proxy

Uses JavaScript Proxy to intercept property access and convert it to RPC calls:
```typescript
bridge.call.methodName(arg1, arg2)
// Becomes: callMethod('methodName', [arg1, arg2])
```

### Pending Requests Map

Correlates request IDs with pending Promises:
```typescript
Map<string, {
  resolve: (value) => void,
  reject: (error) => void,
  timeoutId: ReturnType<typeof setTimeout>
}>
```

## Channel Isolation

Multiple bridges can coexist using different channels:
```
Channel 'widget-a': Parent ◄──► Iframe A
Channel 'widget-b': Parent ◄──► Iframe B
```

Messages include channel identifier and are filtered accordingly.

## Type Safety

TypeScript generics ensure compile-time type safety:
```typescript
createParentBridge<LocalMethods, RemoteMethods>(...)
//                 ^^^^^^^^^^^^  ^^^^^^^^^^^^^
//                 Methods I     Methods I
//                 expose        can call
```

## Security Considerations

1. **Origin validation**: Use `targetOrigin` option instead of `'*'`
2. **Message validation**: All messages checked for `__iframeRpc` marker
3. **Channel isolation**: Messages filtered by channel name
4. **No eval/Function**: No dynamic code execution
