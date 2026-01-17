# Codebase Summary

**Last Updated**: 2026-01-17

## Overview

Single-file TypeScript library (~550 lines) providing type-safe iframe RPC.

## Structure

```
window-iframe-bridge/
├── src/
│   ├── index.ts          # Main library code
│   └── index.test.ts     # Test suite (23 tests)
├── dist/                 # Build output (ESM + CJS)
├── docs/                 # Documentation
├── package.json          # Package config
├── tsconfig.json         # TypeScript config
├── tsup.config.ts        # Build config
├── vitest.config.ts      # Test config
└── README.md             # Usage guide
```

## Key Components

### Type Utilities (lines 31-53)
- `UnwrapPromise<T>` - Extract inner type from Promise
- `MethodContract` - Base type for RPC method definitions
- `VoidMethods<T>` - Extract fire-and-forget methods
- `ValueMethods<T>` - Extract request-response methods

### Message Types (lines 55-107)
- `RequestMessage` - RPC call request
- `ResponseMessage` - Successful response
- `ErrorMessage` - Error response
- `FireAndForgetMessage` - One-way notification

### Error Classes (lines 109-135)
- `RpcError` - Base error with optional code
- `RpcTimeoutError` - Timeout error
- `RpcMethodNotFoundError` - Unknown method error

### Core Bridge (lines 189-433)
- `createBridge()` - Internal bridge factory
- Message handler registration
- Request/response correlation via Map
- Proxy-based call interface

### Public API (lines 435-516)
- `createParentBridge()` - Parent window bridge
- `createIframeBridge()` - Iframe bridge
- Type helpers (`DefineContract`, `ParamsOf`, `ReturnOf`)

## Build Output

- `dist/index.js` - ESM (~7KB)
- `dist/index.cjs` - CommonJS (~7KB)
- `dist/index.d.ts` - TypeScript declarations
