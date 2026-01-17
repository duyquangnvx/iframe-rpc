# Phase 1: Project Setup

**Priority**: High
**Status**: Pending
**Estimated Time**: 2 hours

## Context Links

- **Parent Plan**: [plan.md](./plan.md)
- **Research**: [Existing Libraries](../reports/researcher-260117-0128-existing-libraries.md)
- **Standards**: [Code Standards](../../docs/code-standards.md)

## Overview

Initialize the project with pnpm, configure TypeScript 5.x in strict mode, set up tsup for multi-format bundling (ESM/CJS/DTS), configure Vitest for testing, and Biome for linting/formatting.

## Key Insights from Research

1. **Zero dependencies** is achievable - Penpal and Comlink both have minimal footprints
2. **ESM-first** with CJS fallback is the modern standard
3. **TypeScript strict mode** catches edge cases in type inference
4. **Dual package hazard** - need proper exports configuration

## Requirements

### Functional Requirements
- [ ] Initialize pnpm project with correct package.json structure
- [ ] Configure TypeScript 5.x with strict mode enabled
- [ ] Set up tsup for ESM + CJS + DTS output
- [ ] Configure Vitest with happy-dom for DOM simulation
- [ ] Set up Biome for linting and formatting
- [ ] Create proper package.json exports map

### Non-Functional Requirements
- [ ] Build completes in < 5 seconds
- [ ] TypeScript compilation with zero errors
- [ ] Biome passes with zero warnings
- [ ] Source maps included for debugging

## Architecture

```
Project Root
├── src/                 # TypeScript source
├── dist/                # Build output (gitignored)
│   ├── index.js         # ESM bundle
│   ├── index.cjs        # CJS bundle
│   ├── index.d.ts       # Type declarations
│   └── index.d.cts      # CJS type declarations
├── tests/               # Test files
└── configs              # Tool configurations
```

## Related Code Files

### Files to Create
| File | Purpose |
|------|---------|
| `package.json` | Package manifest with exports |
| `tsconfig.json` | TypeScript configuration |
| `tsup.config.ts` | Bundle configuration |
| `vitest.config.ts` | Test configuration |
| `biome.json` | Linter configuration |
| `.gitignore` | Git exclusions |
| `.npmignore` | NPM publish exclusions |
| `src/index.ts` | Entry point (placeholder) |

## Implementation Steps

### Step 1: Initialize pnpm Project (15 min)

```bash
# Initialize project
pnpm init

# Set package.json fields
```

**package.json content:**
```json
{
  "name": "window-iframe-bridge",
  "version": "0.0.1",
  "description": "Type-safe window-iframe communication library for micro-frontends",
  "keywords": ["iframe", "postmessage", "rpc", "typescript", "micro-frontend"],
  "author": "",
  "license": "MIT",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": {
        "types": "./dist/index.d.ts",
        "default": "./dist/index.js"
      },
      "require": {
        "types": "./dist/index.d.cts",
        "default": "./dist/index.cjs"
      }
    }
  },
  "files": ["dist"],
  "sideEffects": false,
  "engines": {
    "node": ">=18.0.0"
  },
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "lint": "biome check .",
    "lint:fix": "biome check --write .",
    "format": "biome format --write .",
    "typecheck": "tsc --noEmit",
    "prepublishOnly": "pnpm run build"
  },
  "peerDependencies": {
    "zod": "^3.0.0"
  },
  "peerDependenciesMeta": {
    "zod": {
      "optional": true
    }
  },
  "devDependencies": {
    "@biomejs/biome": "^1.9.0",
    "@vitest/coverage-v8": "^2.0.0",
    "happy-dom": "^15.0.0",
    "tsup": "^8.0.0",
    "typescript": "^5.6.0",
    "vitest": "^2.0.0",
    "zod": "^3.23.0"
  }
}
```

### Step 2: Install Dependencies (5 min)

```bash
pnpm install
```

### Step 3: Configure TypeScript (15 min)

**tsconfig.json content:**
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

### Step 4: Configure tsup (15 min)

**tsup.config.ts content:**
```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  minify: true,
  treeshake: true,
  target: 'es2020',
  outDir: 'dist',
  splitting: false,
});
```

### Step 5: Configure Vitest (15 min)

**vitest.config.ts content:**
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
      },
    },
  },
});
```

### Step 6: Configure Biome (15 min)

**biome.json content:**
```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.0/schema.json",
  "vcs": {
    "enabled": true,
    "clientKind": "git",
    "useIgnoreFile": true
  },
  "files": {
    "include": ["src/**/*.ts", "tests/**/*.ts", "*.config.ts"],
    "ignore": ["dist", "node_modules", "coverage"]
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "correctness": {
        "noUnusedImports": "error",
        "noUnusedVariables": "error"
      },
      "style": {
        "noNonNullAssertion": "warn",
        "useConst": "error"
      },
      "suspicious": {
        "noExplicitAny": "warn"
      }
    }
  },
  "organizeImports": {
    "enabled": true
  }
}
```

### Step 7: Create .gitignore (5 min)

**.gitignore content:**
```
# Dependencies
node_modules/

# Build output
dist/

# Test coverage
coverage/

# Environment
.env
.env.*
!.env.example

# IDE
.vscode/
.idea/
*.swp

# OS
.DS_Store
Thumbs.db

# Logs
*.log
npm-debug.log*
pnpm-debug.log*

# Misc
*.tmp
*.temp
```

### Step 8: Create .npmignore (5 min)

**.npmignore content:**
```
# Source
src/
tests/

# Configs
tsconfig.json
tsup.config.ts
vitest.config.ts
biome.json
.gitignore
.github/

# Development
coverage/
*.log
.vscode/
.idea/
```

### Step 9: Create Entry Point Placeholder (5 min)

**src/index.ts content:**
```typescript
/**
 * Window-Iframe Bridge
 *
 * Type-safe window-iframe communication library for micro-frontends.
 *
 * @packageDocumentation
 */

// Types will be exported here
export const VERSION = '0.0.1';

// Placeholder - actual exports added in later phases
```

### Step 10: Verify Setup (15 min)

```bash
# Verify TypeScript compiles
pnpm typecheck

# Verify build works
pnpm build

# Verify Biome passes
pnpm lint

# Check bundle size
ls -la dist/
```

## Todo List

- [ ] Run `pnpm init`
- [ ] Create package.json with full configuration
- [ ] Run `pnpm install` to install dependencies
- [ ] Create tsconfig.json
- [ ] Create tsup.config.ts
- [ ] Create vitest.config.ts
- [ ] Create biome.json
- [ ] Create .gitignore
- [ ] Create .npmignore
- [ ] Create src/index.ts placeholder
- [ ] Run `pnpm typecheck` - should pass
- [ ] Run `pnpm build` - should create dist/
- [ ] Run `pnpm lint` - should pass
- [ ] Verify dist/ contains index.js, index.cjs, index.d.ts

## Success Criteria

- [ ] `pnpm typecheck` passes with zero errors
- [ ] `pnpm build` produces ESM, CJS, and DTS files
- [ ] `pnpm lint` passes with zero errors
- [ ] Bundle size is < 1KB (placeholder only)
- [ ] All config files are valid and properly formatted

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| tsup version incompatibility | Medium | Pin to tested version |
| TypeScript strict mode issues | Low | Start strict from day one |
| Dual package hazard | High | Test both ESM and CJS imports |

## Security Considerations

- [ ] No secrets in config files
- [ ] Dependencies pinned to specific versions
- [ ] .gitignore includes .env files

## Next Steps

After completing this phase:
1. Proceed to [Phase 2: Core Types](./phase-02-core-types.md)
2. Define BridgeContract interface pattern
3. Create message type discriminated unions
