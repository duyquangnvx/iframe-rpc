/**
 * Type-safe usage example for window-iframe-bridge
 *
 * This file demonstrates the full type safety of the library.
 * Run `pnpm typecheck` to verify all types are correct.
 */

import type { BridgeContract } from "./types";
import { createHandlers } from "./types";
import { ChildBridge } from "./child-bridge";
import { ParentBridge } from "./parent-bridge";

// ============================================================================
// Step 1: Define your contracts
// ============================================================================

/**
 * Contract for methods exposed by the Child (iframe)
 */
export interface ChildAPI extends BridgeContract {
  "user/get": {
    request: { id: string };
    response: { id: string; name: string; email: string };
  };
  "user/create": {
    request: { name: string; email: string; role: "admin" | "user" };
    response: { id: string; createdAt: string };
  };
  "user/list": {
    request: { page: number; limit: number };
    response: { users: Array<{ id: string; name: string }>; total: number };
  };
  "app/version": {
    request: Record<string, never>;
    response: { version: string; buildDate: string };
  };
}

/**
 * Contract for methods exposed by the Parent (main window)
 */
export interface ParentAPI extends BridgeContract {
  "auth/getToken": {
    request: Record<string, never>;
    response: { token: string; expiresAt: number };
  };
  "auth/refresh": {
    request: { refreshToken: string };
    response: { token: string; refreshToken: string };
  };
  "storage/get": {
    request: { key: string };
    response: { value: string | null };
  };
  "storage/set": {
    request: { key: string; value: string };
    response: { success: boolean };
  };
  "notify/show": {
    request: { title: string; message: string; type: "info" | "success" | "error" };
    response: { dismissed: boolean };
  };
}

// ============================================================================
// Step 2: Define handlers with `createHandlers` for type inference
// ============================================================================

/**
 * Parent handlers - child can call these methods
 * Using `createHandlers` for full type inference on parameters
 */
const parentMethods = createHandlers<ParentAPI>()({
  "auth/getToken": async () => ({
    token: "jwt-token-here",
    expiresAt: Date.now() + 3600000,
  }),
  "auth/refresh": async (p) => {
    // ✅ p.refreshToken is typed as string
    console.log("Refreshing with:", p.refreshToken);
    return { token: "new-jwt", refreshToken: "new-refresh" };
  },
  "storage/get": async (p) => ({
    // ✅ p.key is typed as string
    value: localStorage.getItem(p.key),
  }),
  "storage/set": async (p) => {
    // ✅ p.key and p.value are typed as string
    localStorage.setItem(p.key, p.value);
    return { success: true };
  },
  "notify/show": async (p) => {
    // ✅ p.type is typed as "info" | "success" | "error"
    console.log(`[${p.type}] ${p.title}: ${p.message}`);
    return { dismissed: false };
  },
});

/**
 * Child handlers - parent can call these methods
 */
const childMethods = createHandlers<ChildAPI>()({
  "user/get": async (p) => ({
    // ✅ p.id is typed as string
    id: p.id,
    name: "John Doe",
    email: "john@example.com",
  }),
  "user/create": async (p) => {
    // ✅ p.role is typed as "admin" | "user"
    console.log(`Creating ${p.role}: ${p.name}`);
    return { id: crypto.randomUUID(), createdAt: new Date().toISOString() };
  },
  "user/list": async (p) => {
    // ✅ p.page and p.limit are typed as number
    console.log(`Page ${p.page}, limit ${p.limit}`);
    return {
      users: [
        { id: "1", name: "User 1" },
        { id: "2", name: "User 2" },
      ],
      total: 100,
    };
  },
  "app/version": async () => ({
    version: "1.0.0",
    buildDate: "2024-01-15",
  }),
});

// ============================================================================
// Step 3: Create bridges
// ============================================================================

export function setupParentBridge(iframe: HTMLIFrameElement) {
  return new ParentBridge<ParentAPI, ChildAPI>({
    target: iframe,
    origin: "https://child.example.com",
    methods: parentMethods,
  });
}

export function setupChildBridge() {
  return new ChildBridge<ChildAPI, ParentAPI>({
    origin: "https://parent.example.com",
    methods: childMethods,
  });
}

// ============================================================================
// Step 4: Type-safe calls (the main type safety benefit!)
// ============================================================================

/**
 * Parent calling child methods - fully type-safe!
 */
export async function parentCallsChild(bridge: ParentBridge<ParentAPI, ChildAPI>) {
  // ✅ Method name autocompleted
  // ✅ Payload validated at compile time
  // ✅ Response fully typed
  const user = await bridge.call("user/get", { id: "123" });
  console.log(user.name); // string
  console.log(user.email); // string

  // ✅ Complex types work
  const newUser = await bridge.call("user/create", {
    name: "John",
    email: "john@example.com",
    role: "admin", // only "admin" | "user" allowed
  });
  console.log(newUser.createdAt);

  // ✅ Array responses
  const { users, total } = await bridge.call("user/list", { page: 1, limit: 10 });
  users.forEach((u) => console.log(u.name));
  console.log(`Total: ${total}`);

  // ✅ Empty payload
  const version = await bridge.call("app/version", {});
  console.log(version.version);

  // ❌ These would be TypeScript errors:
  // bridge.call("user/get", { id: 123 });        // id must be string
  // bridge.call("user/create", { name: "x" });   // missing email, role
  // bridge.call("unknown", {});                  // method doesn't exist
}

/**
 * Child calling parent methods - fully type-safe!
 */
export async function childCallsParent(bridge: ChildBridge<ChildAPI, ParentAPI>) {
  const auth = await bridge.call("auth/getToken", {});
  console.log(`Token: ${auth.token}, expires: ${auth.expiresAt}`);

  await bridge.call("storage/set", { key: "theme", value: "dark" });
  const { value } = await bridge.call("storage/get", { key: "theme" });
  console.log(`Theme: ${value}`);

  await bridge.call("notify/show", {
    title: "Hello",
    message: "Welcome!",
    type: "success", // only "info" | "success" | "error"
  });
}

/**
 * Custom timeout per call
 */
export async function callWithTimeout(bridge: ParentBridge<ParentAPI, ChildAPI>) {
  const user = await bridge.call("user/get", { id: "123" });
  console.log(user.name);

  // Override timeout for slow operations
  const result = await bridge.call("user/list", { page: 1, limit: 1000 }, { timeout: 60000 });
  console.log(`Loaded ${result.users.length} users`);
}
