import crypto from "node:crypto";

// Vite may reevaluate its configuration without restarting the Node process.
// Preserve the existing session token across those reloads, but not process restarts.
const cacheKey = Symbol.for("understand-anything.dashboard.access-token");
const processScope = globalThis as typeof globalThis & { [key: symbol]: unknown };
interface TokenCache { token?: string }
const sharedCache = (processScope[cacheKey] ??= {}) as TokenCache;

export function getDashboardAccessToken(explicitToken?: string, cache: TokenCache = sharedCache): string {
  if (explicitToken) return explicitToken;
  return cache.token ??= crypto.randomBytes(16).toString("hex");
}
