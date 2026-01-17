---
title: "Add Dynamic Invoke Method"
description: "Add invoke() method for dynamic RPC calls while keeping proxy API"
status: completed
priority: P3
effort: 30m
branch: dev
tags: [feature, api]
created: 2026-01-17
---

# Add Dynamic Invoke Method

## Overview

Add `invoke()` method to Bridge interface for dynamic method calls by string name, maintaining type safety. Keep existing proxy-based `call` API as primary.

## Phases

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Add invoke method | ✅ Done | [phase-01](./phase-01-add-invoke-method.md) |

## Success Criteria

- [x] `invoke()` method added with full type safety
- [x] Existing `call` proxy API unchanged
- [x] Tests passing (25/25)
- [x] README updated

## Quick Reference

```typescript
// Existing (primary)
await bridge.call.getUser('123');

// New (dynamic)
await bridge.invoke('getUser', '123');
```
