# Phase 01: Security Hardening

## Context
- Parent: [plan.md](./plan.md)
- Source: `src/index.ts`

## Overview
- Priority: P0 (Critical)
- Status: ✅ done
- Description: Fix security vulnerabilities in message handling

## Key Issues

### 1. Missing Origin Validation (Line 241-263)
Current code accepts messages from ANY origin:
```typescript
const handleMessage = (event: MessageEvent) => {
    if (isDestroyed) return;
    const data = event.data;
    if (!isRpcMessage(data)) return;
    // NO ORIGIN CHECK!
```

### 2. Dangerous Default (Line 150-155)
```typescript
const DEFAULT_OPTIONS = {
    targetOrigin: '*',  // Accepts all origins
};
```

### 3. Incomplete Message Validation (Line 165-172)
Only checks `__iframeRpc` flag, not message structure.

## Implementation Steps

1. Add origin validation in `handleMessage`:
```typescript
const handleMessage = (event: MessageEvent) => {
    if (isDestroyed) return;

    // Validate origin
    if (options.targetOrigin !== '*' && event.origin !== options.targetOrigin) {
        logger.log('Rejected message from:', event.origin);
        return;
    }
    // ...
};
```

2. Add runtime warning for `targetOrigin: '*'`:
```typescript
if (options.debug && mergedOptions.targetOrigin === '*') {
    console.warn('[iframe-rpc] Using targetOrigin:"*" is insecure for production');
}
```

3. Improve `isRpcMessage` validation:
```typescript
function isRpcMessage(data: unknown): data is RpcMessage {
    return (
        typeof data === 'object' &&
        data !== null &&
        '__iframeRpc' in data &&
        (data as any).__iframeRpc === true &&
        'type' in data &&
        Object.values(MESSAGE_TYPE).includes((data as any).type)
    );
}
```

4. Use crypto.randomUUID for IDs:
```typescript
function generateId(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}
```

## Todo List
- [x] Add origin validation
- [x] Add warning for wildcard origin
- [x] Improve message validation
- [x] Use crypto.randomUUID
- [x] Add tests for origin rejection

## Success Criteria
- Messages from untrusted origins rejected
- Warning shown for insecure config
- All message fields validated
- IDs use crypto API when available

## Risk Assessment
- Breaking change: None (validation is additive)
- Backwards compatibility: Maintained with `'*'` default

## Security Considerations
- Origin validation prevents XSS attacks via postMessage
- Crypto IDs prevent ID prediction attacks
