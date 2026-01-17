---
title: "Code Review Improvements"
description: "Security, type safety, and API improvements for iframe-rpc"
status: in_progress
priority: P1
effort: 2h
branch: dev
tags: [security, refactor, api]
created: 2026-01-17
---

# Code Review Improvements

## Overview

Code review identified 13 issues across security, type safety, error handling, and API design.

## Phases

| # | Phase | Priority | Status | File |
|---|-------|----------|--------|------|
| 1 | Security hardening | P0 | ✅ done | [phase-01](./phase-01-security-hardening.md) |
| 2 | Type safety fixes | P1 | ✅ done | [phase-02](./phase-02-type-safety.md) |
| 3 | Error handling | P2 | ✅ done | [phase-03](./phase-03-error-handling.md) |
| 4 | API enhancements | P3 | pending | [phase-04](./phase-04-api-enhancements.md) |

## Critical Issues (Must Fix)

1. **Missing origin validation** - Any origin can send messages
2. **Default `targetOrigin: '*'`** - Dangerous default for production

## High Priority

3. `event.source` null check missing
4. Stack traces exposed in error responses
5. Incomplete message validation

## Medium Priority

6. Non-cryptographic ID generation
7. Silent `notify()` failure
8. Unused type parameter confusion

## Low Priority

9. No handshake/ready mechanism
10. Async fire-and-forget unhandled rejections

## Success Criteria

- [x] Origin validation implemented
- [x] Runtime warnings for insecure defaults
- [x] All type safety issues fixed
- [x] Tests added for security features
- [x] No breaking API changes

## Quick Reference

```typescript
// After improvements:
const bridge = createParentBridge(iframe, handlers, {
  targetOrigin: 'https://trusted.com', // Required for security
  includeStackTraces: false, // Production default
});
```
