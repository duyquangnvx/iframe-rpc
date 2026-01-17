# Research Report: postMessage API Best Practices for Type-Safe Iframe Communication

**Date:** 2026-01-17
**Context:** Type-safe TypeScript library for window-iframe RPC communication (micro-frontends)

---

## 1. Security Best Practices

### Origin Validation (Critical)
```typescript
window.addEventListener('message', (event: MessageEvent) => {
  // ALWAYS validate origin with strict equality
  if (event.origin !== 'https://trusted-domain.com') return;

  // Optionally validate source reference
  if (event.source !== expectedIframe.contentWindow) return;

  // Process message...
});
```

**Security Checklist:**
- Never use `*` as `targetOrigin` when sending sensitive data
- Use strict equality for origin checks (no `indexOf` or regex)
- Sanitize and validate all message data
- Whitelist known origins rather than blacklist

### Sending Messages Securely
```typescript
// Always specify exact origin
iframe.contentWindow?.postMessage(message, 'https://trusted-domain.com');

// NEVER do this for sensitive data:
iframe.contentWindow?.postMessage(message, '*'); // Vulnerable!
```

---

## 2. TypeScript Type Patterns

### Discriminated Unions for Message Types
```typescript
// Define message types with discriminated unions
type ParentToChildMessage =
  | { type: 'INIT'; payload: { config: AppConfig } }
  | { type: 'UPDATE'; payload: { data: unknown } }
  | { type: 'DESTROY' };

type ChildToParentMessage =
  | { type: 'READY' }
  | { type: 'RESULT'; payload: { value: unknown } }
  | { type: 'ERROR'; payload: { code: string; message: string } };

// Type-safe wrapper functions
const sendToChild = (iframe: HTMLIFrameElement, message: ParentToChildMessage, origin: string) =>
  iframe.contentWindow?.postMessage(message, origin);

const sendToParent = (message: ChildToParentMessage, origin: string) =>
  window.parent.postMessage(message, origin);
```

### Type-Safe Event Handler
```typescript
const handleMessage = (event: MessageEvent<ChildToParentMessage>) => {
  if (event.origin !== TRUSTED_ORIGIN) return;

  switch (event.data.type) {
    case 'READY':
      // TypeScript knows no payload here
      break;
    case 'RESULT':
      // TypeScript narrows payload type automatically
      console.log(event.data.payload.value);
      break;
    case 'ERROR':
      console.error(event.data.payload.code, event.data.payload.message);
      break;
  }
};
```

---

## 3. Request-Response Correlation Pattern

### Correlation ID with Deferred Promises
```typescript
interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

class RPCClient {
  private pending = new Map<string, PendingRequest>();
  private counter = 0;

  call<T>(method: string, params: unknown, timeoutMs = 10000): Promise<T> {
    const id = `${Date.now()}-${++this.counter}`;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`RPC timeout: ${method}`));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timeout });

      this.target.postMessage(
        { jsonrpc: '2.0', id, method, params },
        this.targetOrigin
      );
    });
  }

  handleResponse(event: MessageEvent) {
    const { id, result, error } = event.data;
    const pending = this.pending.get(id);
    if (!pending) return;

    clearTimeout(pending.timeout);
    this.pending.delete(id);

    if (error) pending.reject(new Error(error.message));
    else pending.resolve(result);
  }
}
```

### Alternative: MessageChannel for Automatic Correlation
```typescript
const callWithChannel = <T>(target: Window, message: unknown, origin: string): Promise<T> => {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();

    channel.port1.onmessage = ({ data }) => {
      channel.port1.close();
      if (data.error) reject(new Error(data.error));
      else resolve(data.result);
    };

    target.postMessage(message, origin, [channel.port2]);
  });
};
```

---

## 4. Error Handling Across Boundaries

### Structured Error Format
```typescript
interface RPCError {
  code: number;
  message: string;
  data?: unknown;
}

interface RPCResponse<T> {
  id: string;
  result?: T;
  error?: RPCError;
}

// Handler pattern
const handleRPCCall = async (method: string, params: unknown): Promise<RPCResponse<unknown>> => {
  try {
    const result = await executeMethod(method, params);
    return { id, result };
  } catch (err) {
    return {
      id,
      error: {
        code: err instanceof AppError ? err.code : -1,
        message: err instanceof Error ? err.message : 'Unknown error',
      },
    };
  }
};
```

### Timeout with Promise.race
```typescript
const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> => {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Timeout')), ms)
  );
  return Promise.race([promise, timeout]);
};
```

---

## 5. Recommended Patterns

| Pattern | Use Case | Pros | Cons |
|---------|----------|------|------|
| Correlation ID | Multi-call environments | Simple, works everywhere | Manual ID management |
| MessageChannel | Isolated request-response | Auto-correlation, cleaner | Not supported in all contexts |
| JSON-RPC 2.0 | Standard RPC | Well-defined spec | Slightly verbose |

---

## 6. Potential Pitfalls

1. **Race conditions during load**: postMessage during `document.load` can be slow/unreliable
2. **Missing origin validation**: Most common security vulnerability
3. **No timeout handling**: Calls can hang forever without explicit timeouts
4. **Serialization limits**: Only structured-cloneable data can be sent
5. **Multiple iframes**: Need service IDs to namespace messages
6. **Memory leaks**: Pending promises must be cleaned up on timeout/unmount

---

## Sources

- [MDN: Window.postMessage()](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage)
- [Strongly-Typed IFrame Messaging](https://www.nickwhite.cc/blog/strongly-typed-iframe-messaging/)
- [Microsoft postmessage-rpc](https://github.com/microsoft/postmessage-rpc)
- [postMessage Security Checklist](https://gist.github.com/jedp/3005816)
- [Window Post Message Proxy](https://microsoft.github.io/window-post-message-proxy/)
- [Async/Await with postMessage](https://advancedweb.hu/how-to-use-async-await-with-postmessage/)
- [Micro-Frontend Communication](https://dev.to/luistak/cross-micro-frontends-communication-30m3)
