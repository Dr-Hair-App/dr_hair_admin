/**
 * Client-side in-memory TTL and SWR (Stale-While-Revalidate) Cache Utility
 *
 * Dr. Hair Admin Panel Request Optimization (Milestone 2)
 * Eliminates redundant fetches hitting Cloudflare by caching responses in-memory,
 * coalescing in-flight requests, and providing automatic invalidation on mutations.
 */

export interface CachedFetchOptions {
  /** Explicit TTL in milliseconds. Overrides profile default if provided. */
  ttlMs?: number;
  /** SWR grace window in milliseconds during which stale data is returned while revalidating in background. */
  swrMs?: number;
  /** If true, skips reading from cache and forces a fresh network fetch. */
  forceRefresh?: boolean;
  /** If true, enables stale-while-revalidate background refresh. Defaults to true. */
  swr?: boolean;
}

export interface CacheEntry {
  data: unknown;
  headers: Record<string, string>;
  status: number;
  statusText: string;
  timestamp: number;
  ttlMs: number;
  swrMs: number;
}

/**
 * Standard TTL profiles as specified in architecture requirements:
 * - Feature flags: 5 min
 * - Clinic schedule & closed dates: 5 min
 * - Products & categories: 3 min
 * - Content & coupons: 5 min
 * - Short navigation cache: 30-60s (45s) for overview summary and list screens
 */
export const TTL_PROFILES = {
  features: 5 * 60 * 1000,
  schedule: 5 * 60 * 1000,
  closedDates: 5 * 60 * 1000,
  products: 3 * 60 * 1000,
  categories: 3 * 60 * 1000,
  content: 5 * 60 * 1000,
  coupons: 5 * 60 * 1000,
  navigationShort: 45 * 1000,
  default: 60 * 1000,
} as const;

// Module-level in-memory cache and in-flight request tracker
const memoryCache = new Map<string, CacheEntry>();
const inFlightRequests = new Map<string, Promise<Response>>();
let cacheGeneration = 0;
const cacheKeyGenerations = new Map<string, number>();

/**
 * Resolves appropriate TTL based on URL pattern matching or explicit override.
 */
export function resolveTtl(url: string, explicitTtl?: number): number {
  if (typeof explicitTtl === "number" && explicitTtl > 0) {
    return explicitTtl;
  }
  const cleanUrl = url.toLowerCase();
  if (cleanUrl.includes("/features")) {
    return TTL_PROFILES.features;
  }
  if (cleanUrl.includes("/appointments/schedule") || cleanUrl.includes("/appointments/closed-dates") || cleanUrl.includes("/billing")) {
    return TTL_PROFILES.schedule;
  }
  if (cleanUrl.includes("/products") || cleanUrl.includes("/categories")) {
    return TTL_PROFILES.products;
  }
  if (cleanUrl.includes("/content") || cleanUrl.includes("/coupons")) {
    return TTL_PROFILES.content;
  }
  if (cleanUrl.includes("/dashboard/summary") || cleanUrl.includes("/orders") || cleanUrl.includes("/appointments") || cleanUrl.includes("/hair-tests")) {
    return TTL_PROFILES.navigationShort;
  }
  return TTL_PROFILES.default;
}

/**
 * Constructs a cache key from the request URL and relevant init properties.
 */
function getCacheKey(url: string, init?: RequestInit): string {
  const method = (init?.method || "GET").toUpperCase();
  const authorization = new Headers(init?.headers).get("authorization") || "";
  let authHash = 2166136261;
  for (let index = 0; index < authorization.length; index += 1) {
    authHash ^= authorization.charCodeAt(index);
    authHash = Math.imul(authHash, 16777619);
  }
  const scope = authorization ? `auth-${authorization.length}-${authHash >>> 0}` : "public";
  return `${method}:${scope}:${url}`;
}

/**
 * Synthesizes a new Response from a stored cache entry with a fresh readable stream.
 */
function createResponseFromEntry(entry: CacheEntry, isStale = false): Response {
  const bodyString = typeof entry.data === "string" ? entry.data : JSON.stringify(entry.data);
  return new Response(bodyString, {
    status: entry.status,
    statusText: entry.statusText,
    headers: {
      ...entry.headers,
      "content-type": entry.headers["content-type"] || "application/json",
      "x-cache": isStale ? "STALE" : "HIT",
      "x-cache-timestamp": String(entry.timestamp),
    },
  });
}

/** Lets each consumer cancel its wait without cancelling a shared GET. */
function responseForCaller(
  request: Promise<Response>,
  signal?: AbortSignal
): Promise<Response> {
  if (!signal) return request.then((response) => response.clone());
  if (signal.aborted) {
    const error = new Error("The operation was aborted.");
    error.name = "AbortError";
    return Promise.reject(error);
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      const error = new Error("The operation was aborted.");
      error.name = "AbortError";
      reject(error);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    request.then(
      (response) => {
        signal.removeEventListener("abort", onAbort);
        resolve(response.clone());
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      }
    );
  });
}

/**
 * Executes a network fetch and populates the cache on successful responses.
 */
async function fetchAndCache(
  url: string,
  init: RequestInit | undefined,
  ttlMs: number,
  swrMs: number,
  requestGeneration: number,
  requestKeyGeneration: number
): Promise<Response> {
  const cacheKey = getCacheKey(url, init);
  const response = await fetch(url, init);

  // Only cache successful GET responses
  const method = (init?.method || "GET").toUpperCase();
  if (
    method === "GET" &&
    response.ok &&
    cacheGeneration === requestGeneration &&
    (cacheKeyGenerations.get(cacheKey) || 0) === requestKeyGeneration
  ) {
    try {
      // Clone response to read body for storage without consuming the returned response
      const cloned = response.clone();
      let data: unknown;
      const contentType = cloned.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        data = await cloned.json();
      } else {
        data = await cloned.text();
      }

      const headers: Record<string, string> = {};
      cloned.headers.forEach((val, key) => {
        if (key.toLowerCase() !== "set-cookie") headers[key] = val;
      });

      const entry: CacheEntry = {
        data,
        headers,
        status: cloned.status,
        statusText: cloned.statusText,
        timestamp: Date.now(),
        ttlMs,
        swrMs,
      };

      memoryCache.set(cacheKey, entry);
    } catch {
      // If parsing fails, proceed with returning raw response
    }
  }

  return response;
}

/**
 * Performs a cached fetch with TTL and SWR support.
 *
 * - Returns cached response immediately if fresh (< TTL).
 * - Returns stale cached response and triggers background revalidation if within SWR window.
 * - Coalesces concurrent in-flight requests for identical URLs.
 * - Automatically invalidates related cache on mutations (POST, PUT, PATCH, DELETE).
 */
export async function cachedFetch(
  url: string,
  init?: RequestInit,
  ttlMs?: number,
  options?: CachedFetchOptions
): Promise<Response> {
  const method = (init?.method || "GET").toUpperCase();
  const cacheKey = getCacheKey(url, init);

  // If this is a mutating request, bypass cache, invalidate matching entries, and execute
  if (method !== "GET" && method !== "HEAD") {
    const res = await fetch(url, init);
    // Invalidate URL path base
    const pathOnly = url.split("?")[0];
    invalidateCache(pathOnly);
    return res;
  }

  const effectiveTtl = resolveTtl(url, ttlMs ?? options?.ttlMs);
  const effectiveSwr = options?.swrMs ?? effectiveTtl;
  const allowSwr = options?.swr !== false;
  const forceRefresh = options?.forceRefresh === true;
  const requestGeneration = cacheGeneration;
  if (forceRefresh) {
    cacheKeyGenerations.set(cacheKey, (cacheKeyGenerations.get(cacheKey) || 0) + 1);
  }
  const requestKeyGeneration = cacheKeyGenerations.get(cacheKey) || 0;
  const networkInit = init?.signal ? { ...init, signal: undefined } : init;

  const now = Date.now();
  const cached = memoryCache.get(cacheKey);

  // 1. Fresh cache hit
  if (cached && !forceRefresh) {
    const age = now - cached.timestamp;
    if (age < cached.ttlMs) {
      return createResponseFromEntry(cached, false);
    }

    // 2. Stale cache within SWR grace window
    if (allowSwr && age < cached.ttlMs + cached.swrMs) {
      // Trigger background revalidation if not already in-flight
      if (!inFlightRequests.has(cacheKey)) {
        const revalidatePromise = fetchAndCache(
          url,
          networkInit,
          effectiveTtl,
          effectiveSwr,
          requestGeneration,
          requestKeyGeneration
        );
        inFlightRequests.set(cacheKey, revalidatePromise);
        void revalidatePromise.catch(() => {
          // Silently suppress background revalidation errors
        }).finally(() => {
            if (inFlightRequests.get(cacheKey) === revalidatePromise) {
              inFlightRequests.delete(cacheKey);
            }
          });
        // We do not await revalidation here — return stale immediately
        void revalidatePromise;
      }
      return createResponseFromEntry(cached, true);
    }
  }

  // 3. Coalesce in-flight requests to prevent duplicate network calls
  const existingInFlight = inFlightRequests.get(cacheKey);
  if (existingInFlight && !forceRefresh) {
    return responseForCaller(existingInFlight, init?.signal);
  }

  // 4. Cache miss or expired — initiate network fetch
  const fetchPromise = (async () => {
    try {
      return await fetchAndCache(
        url,
        networkInit,
        effectiveTtl,
        effectiveSwr,
        requestGeneration,
        requestKeyGeneration
      );
    } finally {
      if (inFlightRequests.get(cacheKey) === fetchPromise) {
        inFlightRequests.delete(cacheKey);
      }
    }
  })();

  inFlightRequests.set(cacheKey, fetchPromise);
  return responseForCaller(fetchPromise, init?.signal);
}

/**
 * Convenience helper to fetch and parse JSON with in-memory caching.
 */
export async function cachedFetchJson<T = unknown>(
  url: string,
  init?: RequestInit,
  ttlMs?: number,
  options?: CachedFetchOptions
): Promise<T> {
  const response = await cachedFetch(url, init, ttlMs, options);
  return (await response.json()) as T;
}

/**
 * Invalidates entries in the cache.
 * If pattern is provided, invalidates keys matching the pattern (string substring or RegExp).
 * If pattern is omitted, clears the entire cache.
 */
export function invalidateCache(pattern?: string | RegExp): void {
  if (!pattern) {
    clearCache();
    return;
  }

  // Prevent an older matching GET from restoring data after a write.

  const matches = (key: string) =>
    typeof pattern === "string" ? key.includes(pattern) : pattern.test(key);

  for (const key of inFlightRequests.keys()) {
    if (matches(key)) {
      cacheKeyGenerations.set(key, (cacheKeyGenerations.get(key) || 0) + 1);
    }
  }

  for (const key of Array.from(memoryCache.keys())) {
    if (matches(key)) {
      memoryCache.delete(key);
    }
  }
}

/**
 * Clears the entire in-memory cache and cancels any tracking.
 */
export function clearCache(): void {
  cacheGeneration += 1;
  memoryCache.clear();
  inFlightRequests.clear();
  cacheKeyGenerations.clear();
}

/**
 * Diagnostic helper to inspect active cache keys and size.
 */
export function getCacheStats(): { size: number; keys: string[] } {
  return {
    size: memoryCache.size,
    keys: Array.from(memoryCache.keys()),
  };
}
