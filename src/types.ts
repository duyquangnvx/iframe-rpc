/**
 * Type utilities and contracts for iframe-rpc
 */

/** Extract the return type, unwrapping Promise if needed */
export type UnwrapPromise<T> = T extends Promise<infer U> ? U : T;

/** Check if a type is a function */
export type IsFunction<T> = T extends (...args: any[]) => any ? true : false;

/** Method definition - can be sync or async */
export type AnyMethod = (...args: any[]) => any;

/** Contract for RPC methods */
export type MethodContract = Record<string, AnyMethod>;

/** Extract methods that return void (fire-and-forget) */
export type VoidMethods<T extends MethodContract> = {
    [K in keyof T]: UnwrapPromise<ReturnType<T[K]>> extends void ? K : never;
}[keyof T];

/** Extract methods that return a value (request-response) */
export type ValueMethods<T extends MethodContract> = Exclude<keyof T, VoidMethods<T>>;

/** Type-safe proxy for calling remote methods */
export type CallProxy<T extends MethodContract> = {
    [K in keyof T]: T[K] extends (...args: infer A) => infer R
    ? (...args: A) => Promise<UnwrapPromise<R>>
    : never;
};

/**
 * Helper type to define RPC method contracts
 * Ensures all methods are properly typed
 */
export type DefineContract<T extends MethodContract> = T;

/**
 * Extract parameter types from a method contract
 */
export type ParamsOf<T extends MethodContract, K extends keyof T> = Parameters<T[K]>;

/**
 * Extract return type from a method contract
 */
export type ReturnOf<T extends MethodContract, K extends keyof T> = UnwrapPromise<ReturnType<T[K]>>;
