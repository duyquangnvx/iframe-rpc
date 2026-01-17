# Window-Iframe Bridge - Implementation Plan

**Date**: 2026-01-17
**Type**: Library Development
**Status**: Planning
**Library Name**: `window-iframe-bridge`
**Target Bundle Size**: ~2KB gzipped

## Project Overview

A TypeScript-first, framework-agnostic library for type-safe window-iframe communication using RPC pattern. Designed for micro-frontends with contract-first API design, correlation ID pattern, and configurable timeouts.

## Context Links

- **Research Reports**:
  - [TypeScript RPC Patterns](../reports/researcher-260117-0128-typescript-rpc-patterns.md)
  - [Existing Libraries Analysis](../reports/researcher-260117-0128-existing-libraries.md)
  - [postMessage Best Practices](../reports/researcher-260117-0128-postmessage-patterns.md)
- **Reference Docs**: [Code Standards](../../docs/code-standards.md)

## Tech Stack

| Tool | Version | Purpose |
|------|---------|---------|
| TypeScript | 5.x | Core language (strict mode) |
| tsup | latest | Bundler (ESM + CJS + DTS) |
| Vitest | latest | Testing framework |
| pnpm | latest | Package manager |
| Biome | latest | Linting + formatting |
| Zod | optional | Runtime validation (peer dep) |

## Phase Overview

| Phase | Name | Status | Est. Time |
|-------|------|--------|-----------|
| 1 | [Project Setup](./phase-01-project-setup.md) | Pending | 2 hours |
| 2 | [Core Types](./phase-02-core-types.md) | Pending | 3 hours |
| 3 | [Parent Bridge](./phase-03-parent-bridge.md) | Pending | 4 hours |
| 4 | [Child Bridge](./phase-04-child-bridge.md) | Pending | 3 hours |
| 5 | [Testing](./phase-05-testing.md) | Pending | 4 hours |
| 6 | [Documentation](./phase-06-documentation.md) | Pending | 2 hours |

**Total Estimated Time**: 18 hours

## Key Design Decisions

1. **Contract-first API**: Define `BridgeContract` interface for full type inference
2. **Correlation ID pattern**: Request-response matching with UUID
3. **Discriminated unions**: Message type narrowing without branded types
4. **Proxy API (optional)**: Ergonomic `client.method()` syntax
5. **Zero dependencies**: Optional Zod peer dependency for validation

## File Structure (Target)

```
window-iframe-bridge/
├── src/
│   ├── index.ts              # Public exports
│   ├── types/
│   │   ├── contract.ts       # BridgeContract, method types
│   │   ├── messages.ts       # Request, Response, Handshake
│   │   ├── errors.ts         # BridgeError types
│   │   └── config.ts         # Configuration types
│   ├── parent-bridge.ts      # ParentBridge class
│   ├── child-bridge.ts       # ChildBridge class
│   └── utils/
│       ├── correlation.ts    # ID generation
│       ├── timeout.ts        # Timeout utilities
│       └── validation.ts     # Optional Zod integration
├── tests/
│   ├── types.test.ts
│   ├── parent-bridge.test.ts
│   ├── child-bridge.test.ts
│   └── integration.test.ts
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── biome.json
├── vitest.config.ts
└── README.md
```

## Success Criteria

- [ ] TypeScript strict mode passes
- [ ] Bundle size < 2KB gzipped (without Zod)
- [ ] 90%+ test coverage
- [ ] Works in modern browsers (ES2020+)
- [ ] Full type inference on contract methods
- [ ] Origin validation enforced
- [ ] Request timeout handling
