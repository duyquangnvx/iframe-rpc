# TypeScript RPC Patterns Research Report

**Date**: 2026-01-17
**Context**: Type-safe window-iframe communication library for micro-frontends

## 1. Message Contract Patterns

### Generic Request/Response Types
```typescript
// Base message types with discriminated unions
type MessageType = string;

interface BaseMessage<T extends MessageType = MessageType> {
  type: T;
  id: string;
  timestamp: number;
}

interface Request<T extends MessageType, P = unknown> extends BaseMessage<T> {
  payload: P;
}

interface Response<T extends MessageType, R = unknown, E = unknown> extends BaseMessage<T> {
  requestId: string;
  success: boolean;
  data?: R;
  error?: E;
}
```

### Contract Definition Pattern (Recommended)
```typescript
// Define contracts as interface maps
interface RPCContract {
  'user/get': { request: { id: string }; response: { name: string; email: string } };
  'user/update': { request: { id: string; name: string }; response: { success: boolean } };
  'auth/login': { request: { token: string }; response: { sessionId: string } };
}

// Extract types from contract
type RPCMethod = keyof RPCContract;
type RequestPayload<M extends RPCMethod> = RPCContract[M]['request'];
type ResponsePayload<M extends RPCMethod> = RPCContract[M]['response'];
```

## 2. Type Inference Patterns

### Mapped Types for Handler Registration
```typescript
type Handler<M extends RPCMethod> = (
  payload: RequestPayload<M>
) => Promise<ResponsePayload<M>> | ResponsePayload<M>;

type Handlers<C extends RPCContract> = {
  [M in keyof C]: Handler<M>;
};

// Usage: Full type inference on both input and return
const handlers: Handlers<RPCContract> = {
  'user/get': async (payload) => ({ name: 'John', email: 'john@example.com' }),
  'user/update': (payload) => ({ success: true }),
  'auth/login': async ({ token }) => ({ sessionId: crypto.randomUUID() }),
};
```

### Conditional Types for Response Inference
```typescript
type InferResponse<M extends RPCMethod> = M extends keyof RPCContract
  ? RPCContract[M]['response']
  : never;

// Client call with inferred return type
async function call<M extends RPCMethod>(
  method: M,
  payload: RequestPayload<M>
): Promise<ResponsePayload<M>> {
  // Implementation
}

// Usage: Return type automatically inferred
const user = await call('user/get', { id: '123' }); // Type: { name: string; email: string }
```

## 3. Branded Types for Message Discrimination

### Nominal Typing with Symbols
```typescript
declare const RequestBrand: unique symbol;
declare const ResponseBrand: unique symbol;

type RequestMessage<M extends RPCMethod> = BaseMessage<M> & {
  readonly [RequestBrand]: M;
  payload: RequestPayload<M>;
};

type ResponseMessage<M extends RPCMethod> = BaseMessage<M> & {
  readonly [ResponseBrand]: M;
  requestId: string;
  data: ResponsePayload<M>;
};

// Type guards with branded types
function isRequest<M extends RPCMethod>(
  msg: unknown,
  method: M
): msg is RequestMessage<M> {
  return typeof msg === 'object' && msg !== null && (msg as any).type === method;
}
```

## 4. Runtime Validation with Zod

### Schema-First Contract Definition
```typescript
import { z } from 'zod';

// Define schemas
const UserGetRequest = z.object({ id: z.string().uuid() });
const UserGetResponse = z.object({ name: z.string(), email: z.string().email() });

// Contract using Zod schemas
const rpcSchemas = {
  'user/get': { request: UserGetRequest, response: UserGetResponse },
} as const;

// Infer TypeScript types from Zod
type ZodRPCContract = {
  [K in keyof typeof rpcSchemas]: {
    request: z.infer<typeof rpcSchemas[K]['request']>;
    response: z.infer<typeof rpcSchemas[K]['response']>;
  };
};

// Validation wrapper
function validateMessage<M extends keyof typeof rpcSchemas>(
  method: M,
  payload: unknown
): z.infer<typeof rpcSchemas[M]['request']> {
  return rpcSchemas[method].request.parse(payload);
}
```

## 5. Proxy-Based Type-Safe RPC

### Proxy Pattern for Natural API
```typescript
type RPCProxy<C extends Record<string, { request: unknown; response: unknown }>> = {
  [M in keyof C]: (payload: C[M]['request']) => Promise<C[M]['response']>;
};

function createRPCProxy<C extends Record<string, { request: unknown; response: unknown }>>(
  send: <M extends keyof C>(method: M, payload: C[M]['request']) => Promise<C[M]['response']>
): RPCProxy<C> {
  return new Proxy({} as RPCProxy<C>, {
    get(_, method: string) {
      return (payload: unknown) => send(method as keyof C, payload);
    },
  });
}

// Usage: Natural method calls with full type safety
const client = createRPCProxy<RPCContract>(send);
const user = await client['user/get']({ id: '123' }); // Fully typed
```

## 6. Comparison of Approaches

| Approach | Type Safety | Runtime Validation | Bundle Size | Complexity |
|----------|-------------|-------------------|-------------|------------|
| Generic Contracts | High | No | Minimal | Low |
| Zod Schemas | High | Yes | +15KB | Medium |
| io-ts | High | Yes | +8KB | High |
| Branded Types | Very High | No | Minimal | Medium |
| Proxy Pattern | High | Optional | Minimal | Medium |

## 7. Recommended API Design

### Hybrid Approach: Contracts + Optional Validation
```typescript
// Core types (always included)
export interface BridgeContract {
  // Define your methods here
}

// Type-safe client
export interface BridgeClient<C extends BridgeContract> {
  call<M extends keyof C>(method: M, payload: C[M]['request']): Promise<C[M]['response']>;
  on<M extends keyof C>(method: M, handler: (payload: C[M]['request']) => C[M]['response'] | Promise<C[M]['response']>): () => void;
}

// Optional: Zod schema registry for runtime validation
export interface SchemaRegistry<C extends BridgeContract> {
  request: { [M in keyof C]?: z.ZodType<C[M]['request']> };
  response: { [M in keyof C]?: z.ZodType<C[M]['response']> };
}
```

## 8. Trade-offs

**Pure TypeScript (No Zod)**
- Pros: Zero dependencies, smaller bundle, faster runtime
- Cons: No runtime validation, trust boundary issues

**With Zod**
- Pros: Runtime safety, schema reuse, error messages
- Cons: +15KB bundle, parsing overhead

**Recommendation for Micro-frontends**: Use pure TypeScript contracts with optional Zod validation at trust boundaries (message receipt). This balances type safety, bundle size, and runtime performance.

## Key Insights

1. **Contract-first design** enables full type inference for both caller and handler
2. **Discriminated unions** on message `type` field enable narrowing without branded types
3. **Proxy pattern** provides ergonomic API while maintaining type safety
4. **Optional validation** via Zod only at cross-origin boundaries balances safety vs. overhead
5. **Generic constraints** with `keyof` preserve literal types for method names

## Unresolved Questions

1. Should validation be opt-in per method or global setting?
2. How to handle streaming/chunked responses in contract types?
3. Error type standardization across different failure modes?
