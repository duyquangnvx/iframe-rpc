# Phase 01: Add Invoke Method

## Context
- Plan: [plan.md](./plan.md)
- Source: `src/index.ts`

## Overview
- **Priority**: P3
- **Status**: ⬜ Pending
- **Effort**: 30m

Add type-safe `invoke()` method for dynamic RPC calls.

## Requirements

**Functional:**
- Add `invoke<K>(method: K, ...args)` to Bridge interface
- Full TypeScript inference for method name and args
- Return Promise with correct type

**Non-functional:**
- No breaking changes to existing API
- Reuse existing `callMethod` internal function

## Related Code Files

**Modify:**
- `src/index.ts` - Add invoke to Bridge interface and createBridge
- `src/index.test.ts` - Add tests
- `README.md` - Add usage example

## Implementation Steps

### 1. Update Bridge Interface (~5 lines)
```typescript
// In Bridge interface, add after notify:
invoke: <K extends keyof TRemote>(
    method: K,
    ...args: Parameters<TRemote[K]>
) => Promise<UnwrapPromise<ReturnType<TRemote[K]>>>;
```

### 2. Implement in createBridge (~3 lines)
```typescript
// In return object, add:
invoke: <K extends keyof TRemote>(method: K, ...args: Parameters<TRemote[K]>) =>
    callMethod(method, args),
```

### 3. Add Tests (~20 lines)
- Test invoke with valid method
- Test invoke returns correct type
- Test invoke after destroy throws error

### 4. Update README
Add example showing both APIs side by side.

## Todo List

- [ ] Add invoke to Bridge interface
- [ ] Implement invoke in createBridge
- [ ] Add tests for invoke
- [ ] Update README with example
- [ ] Run tests and build

## Success Criteria

- [ ] `bridge.invoke('method', args)` works
- [ ] TypeScript autocompletes method names
- [ ] TypeScript validates args
- [ ] All 23+ tests pass
- [ ] Build succeeds

## Risk Assessment

**Low risk** - Simple addition, no changes to existing code paths.
