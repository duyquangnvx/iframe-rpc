# Code Standards

**Last Updated**: 2026-01-17
**Project**: window-iframe-bridge

## Development Principles

- **YAGNI**: Only implement what's needed
- **KISS**: Keep solutions simple
- **DRY**: Extract reusable logic

## TypeScript Guidelines

### Naming Conventions
- **Types/Interfaces**: PascalCase (`MethodContract`, `BridgeOptions`)
- **Functions**: camelCase (`createParentBridge`, `generateId`)
- **Constants**: UPPER_SNAKE_CASE (`MESSAGE_TYPE`, `DEFAULT_OPTIONS`)
- **Private types**: Prefix with underscore if unused but kept for documentation

### Type Safety
- Use strict TypeScript config
- Avoid `any` where possible (allowed in generic constraints)
- Export public types for consumers

## Code Organization

### File Structure
```
src/
├── index.ts        # Main entry, all exports
└── index.test.ts   # Tests
```

### Section Comments
Use section headers for logical grouping:
```typescript
// ============================================================================
// Section Name
// ============================================================================
```

## Testing

- Use Vitest with jsdom environment
- Test public API, error cases, edge cases
- Mock window/postMessage for unit tests

## Build

- Target ES2020
- Output ESM + CJS
- Generate declaration files

## Commit Messages

Follow conventional commits:
```
feat: add new feature
fix: resolve bug
docs: update documentation
test: add tests
refactor: improve code structure
```
