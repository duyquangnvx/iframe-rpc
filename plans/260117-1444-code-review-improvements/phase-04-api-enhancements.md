# Phase 04: API Enhancements

## Context
- Parent: [plan.md](./plan.md)
- Source: `src/index.ts`

## Overview
- Priority: P3
- Status: pending
- Description: Optional API improvements for DX

## Key Issues

### 1. No Readiness Check
No way to know if remote side is ready. Messages sent before iframe loads are lost.

### 2. No Connection Status Events
Callers can't subscribe to connection state changes.

## Possible Enhancements

### Option A: Handshake Mechanism (Recommended)
```typescript
interface Bridge<TRemote> {
    // Existing...

    /** Wait for remote side to be ready */
    waitForReady(timeout?: number): Promise<void>;

    /** Check if handshake completed */
    isReady(): boolean;
}
```

Implementation:
- Send `PING` message on bridge creation
- Remote responds with `PONG`
- `waitForReady()` resolves when `PONG` received

### Option B: Event Emitter Pattern
```typescript
interface Bridge<TRemote> {
    on(event: 'ready' | 'error' | 'disconnect', callback: Function): void;
    off(event: string, callback: Function): void;
}
```

## Recommendation

**Defer to future version.** Current API is functional. Handshake adds complexity and may not be needed for all use cases.

If implemented, suggest:
- Make handshake optional via config
- Add `autoConnect: boolean` option
- Keep current behavior as default

## Todo List
- [ ] Consider for v0.2.0
- [ ] Gather user feedback first
- [ ] Document workarounds in README

## Current Workaround
```typescript
// Parent waits for iframe load
iframe.onload = () => {
    const bridge = createParentBridge(iframe, handlers);
    // Safe to call now
};
```

## Success Criteria
- Document current limitations
- Gather feedback before implementing
- Maintain backwards compatibility
