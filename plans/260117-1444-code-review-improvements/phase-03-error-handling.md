# Phase 03: Error Handling

## Context
- Parent: [plan.md](./plan.md)
- Source: `src/index.ts`

## Overview
- Priority: P2
- Status: ✅ done
- Description: Improve error handling patterns

## Key Issues

### 1. Stack Trace Exposure (Line 339-352)
Sends stack traces to remote side:
```typescript
error: {
    message: error.message,
    ...(error.stack ? { stack: error.stack } : {}),
},
```

### 2. Silent `notify()` Failure (Line 389-407)
No feedback when notify fails on destroyed bridge.

### 3. Async Fire-and-Forget (Line 309-321)
Async handler rejections unhandled:
```typescript
try {
    (handler as AnyMethod)(...message.args);  // Promise ignored
} catch (error) {
    logger.error('Error in fire-and-forget handler:', error);
}
```

## Implementation Steps

1. Add option to control stack traces:
```typescript
interface BridgeOptions {
    /** Include stack traces in errors. Default: false */
    includeStackTraces?: boolean;
}

const sendError = (targetWindow: Window, id: string, error: Error) => {
    const message: ErrorMessage = {
        // ...
        error: {
            message: error.message,
            ...(error instanceof RpcError && error.code ? { code: error.code } : {}),
            ...(options.includeStackTraces && error.stack ? { stack: error.stack } : {}),
        },
    };
};
```

2. Handle async fire-and-forget:
```typescript
const handleFireAndForget = (message: FireAndForgetMessage) => {
    const handler = handlers[message.method as keyof TLocal];
    if (!handler) {
        logger.error('Handler not found:', message.method);
        return;
    }

    Promise.resolve()
        .then(() => (handler as AnyMethod)(...message.args))
        .catch(error => logger.error('Error in fire-and-forget:', error));
};
```

## Todo List
- [x] Add `includeStackTraces` option
- [x] Default to false for security
- [x] Handle async handlers properly
- [x] All existing tests pass (29/29)

## Success Criteria
- Stack traces not leaked by default
- Async errors logged properly
- No unhandled promise rejections

## Security Considerations
- Stack traces can reveal code structure
- Default off protects production deployments
