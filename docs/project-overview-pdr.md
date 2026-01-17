# window-iframe-bridge - Product Development Requirements

**Version**: 0.1.0
**Last Updated**: 2026-01-17
**Status**: Initial Release

## Executive Summary

A lightweight TypeScript library providing type-safe bidirectional RPC communication between parent windows and iframes using the postMessage API.

## Problem Statement

Communicating between parent windows and iframes requires manual postMessage handling, message type checking, and response correlation. This leads to:
- Boilerplate code for message handling
- No type safety between sender and receiver
- Manual timeout handling
- Complex error management

## Solution

window-iframe-bridge provides:
- Type-safe RPC proxy with full TypeScript inference
- Automatic request/response correlation
- Built-in timeout handling
- Fire-and-forget notifications
- Channel isolation for multiple bridges

## Target Users

1. **Micro-frontend developers** - Integrating multiple apps in iframes
2. **Widget developers** - Embedding third-party widgets
3. **Plugin systems** - Sandboxed plugin communication

## Core Features

### 1. Type-Safe RPC
Full TypeScript inference for method parameters and return types without runtime overhead.

### 2. Bidirectional Communication
Both parent and iframe can expose methods and call each other.

### 3. Fire-and-Forget
Support for one-way notifications that don't wait for responses.

### 4. Timeout Handling
Configurable timeouts with automatic cleanup and typed errors.

### 5. Channel Isolation
Multiple independent bridges on the same page without interference.

## Technical Requirements

### Functional
- FR1: Create bridge from parent to iframe
- FR2: Create bridge from iframe to parent
- FR3: Type-safe method calls with Promise return
- FR4: Fire-and-forget notifications
- FR5: Configurable timeout handling
- FR6: Channel-based message isolation
- FR7: Debug logging option

### Non-Functional
- NFR1: Zero runtime dependencies
- NFR2: < 3KB minified + gzipped
- NFR3: ES2020+ browser support
- NFR4: Dual ESM/CJS package format

## Success Metrics

- Bundle size < 3KB gzipped
- 100% TypeScript coverage
- Test coverage > 80%

## Unresolved Questions

None.
