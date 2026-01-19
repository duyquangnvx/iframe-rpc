# window-iframe-bridge - Project Roadmap

**Last Updated:** 2026-01-17
**Current Version:** 0.1.0
**Status:** Initial Release

## Overview

A lightweight TypeScript library for type-safe bidirectional RPC between parent windows and iframes.

---

## Version 0.1.0 (Current)

**Status:** ✅ Complete
**Release:** January 2026

### Features
- [x] Type-safe RPC proxy with full TypeScript inference
- [x] Bidirectional communication (parent ↔ iframe)
- [x] Fire-and-forget notifications
- [x] Configurable timeouts with typed errors
- [x] Channel isolation for multiple bridges
- [x] Debug logging option
- [x] Dual ESM/CJS package output

### Technical
- [x] Zero runtime dependencies
- [x] ES2020 target
- [x] Comprehensive test suite (23 tests)

---

## Future Roadmap

### v0.2.0 - Enhanced Features (Planned)
- [ ] Connection lifecycle events (connect, disconnect, reconnect)
- [ ] Batch call support (multiple calls in single message)
- [ ] Message compression for large payloads
- [x] Retry mechanism for failed calls

### v0.3.0 - Developer Experience (Planned)
- [ ] DevTools extension for message inspection
- [ ] Bridge health monitoring
- [ ] Performance metrics collection
- [ ] Better error stack traces across boundaries

### v1.0.0 - Stable Release (Planned)
- [ ] API stabilization
- [ ] Comprehensive documentation site
- [ ] Migration guide from other solutions
- [ ] Security audit

---

## Success Metrics

- Bundle size < 3KB gzipped ✅
- Zero runtime dependencies ✅
- TypeScript coverage 100% ✅
- Test coverage > 80% (Target)
