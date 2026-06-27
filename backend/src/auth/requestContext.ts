import { AsyncLocalStorage } from "node:async_hooks";

type RequestContext = { userId: string | null };

const storage = new AsyncLocalStorage<RequestContext>();

export function getCurrentUserId(): string | null {
  return storage.getStore()?.userId ?? null;
}

/**
 * Sets the userId for the CURRENT async scope (and all continuations from it).
 * Call this early in a request handler (e.g. inside requireAuth) so that all
 * downstream Prisma operations in the same handler context pick up the userId.
 */
export function setCurrentUser(userId: string | null): void {
  storage.enterWith({ userId });
}

/**
 * Wraps fn in a new async context with the given userId.
 * Useful for seed scripts or background tasks that need explicit scoping.
 */
export function runWithUser<T>(userId: string | null, fn: () => Promise<T>): Promise<T> {
  return storage.run({ userId }, fn);
}
