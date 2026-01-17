---
title: "Interactive Demo Test Pages"
description: "Create parent.html and iframe.html demo pages to test all iframe-rpc features"
status: completed
priority: P2
effort: 1h
branch: dev
tags: [demo, testing, examples]
created: 2026-01-17
---

# Interactive Demo Test Pages

## Overview

Create interactive demo pages in `examples/demo/` to manually test all iframe-rpc library features.

## Phases

| # | Phase | Priority | Status | File |
|---|-------|----------|--------|------|
| 1 | Create demo pages | P2 | ✅ done | [phase-01](./phase-01-create-demo-pages.md) |

## Architecture

```
examples/demo/
├── parent.html    # Parent window with iframe
└── iframe.html    # Iframe content
```

## Features to Demo

1. **RPC Calls**
   - `bridge.call.method()` - Proxy API
   - `bridge.invoke('method', args)` - Dynamic API

2. **Fire-and-Forget**
   - `bridge.notify('method', args)`

3. **Error Handling**
   - Method not found
   - Timeout errors

4. **Bridge Lifecycle**
   - `bridge.destroy()`
   - `bridge.isActive()`

5. **Options**
   - Debug logging
   - Custom channel
   - targetOrigin validation

## Success Criteria

- [ ] Both pages load without errors
- [ ] All bridge methods testable via UI
- [ ] Console shows debug logs
- [ ] Errors displayed properly
- [ ] Works with `pnpm build` output

## Usage

```bash
# Build the library first
pnpm build

# Serve the examples (any static server)
npx serve .

# Open http://localhost:3000/examples/demo/parent.html
```
