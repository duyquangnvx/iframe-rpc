# Phase 02: Type Safety Fixes

## Context
- Parent: [plan.md](./plan.md)
- Source: `src/index.ts`

## Overview
- Priority: P1
- Status: ✅ done
- Description: Fix type safety issues

## Key Issues

### 1. Null `event.source` (Line 252)
Unsafe cast without null check:
```typescript
case MESSAGE_TYPE.REQUEST:
    handleRequest(data as RequestMessage, event.source as Window);
```

### 2. Unused Type Parameter (Line 201-204)
Confusing underscore prefix:
```typescript
export interface Bridge<
    _TLocal extends MethodContract,  // Unused but passed
    TRemote extends MethodContract
>
```

### 3. Proxy Handler Type Assertions (Line 410-414)
Could handle Symbol properties better.

## Implementation Steps

1. Add null check for `event.source`:
```typescript
case MESSAGE_TYPE.REQUEST:
    if (!event.source) {
        logger.error('Request received with null source');
        return;
    }
    handleRequest(data as RequestMessage, event.source as Window);
    break;
```

2. Remove unused type parameter from public interface:
```typescript
export interface Bridge<TRemote extends MethodContract> {
    // ...
}
```
Note: This is breaking change - may keep for future use.

3. Add Symbol check in Proxy:
```typescript
const call = new Proxy({} as CallProxy<TRemote>, {
    get(_, prop) {
        if (typeof prop === 'symbol') return undefined;
        return (...args: unknown[]) => callMethod(prop as keyof TRemote, args);
    },
});
```

## Todo List
- [x] Add null check for event.source
- [x] Document or remove unused type param
- [x] Handle Symbol properties in Proxy
- [x] All existing tests pass (29/29)

## Success Criteria
- No runtime type errors
- Cleaner public API
- Symbol property access handled

## Risk Assessment
- Breaking: Removing type param would break existing code
- Recommendation: Keep param, add JSDoc explaining future use
