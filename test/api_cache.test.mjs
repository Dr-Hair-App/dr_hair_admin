import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  cachedFetch,
  cachedFetchJson,
  invalidateCache,
  clearCache,
  resolveTtl,
  TTL_PROFILES,
  getCacheStats,
} from "../src/features/shared/lib/api-cache.ts";

describe("api-cache.ts Client-Side Request Cache Utility", () => {
  beforeEach(() => {
    clearCache();
  });

  it("resolves default TTL profiles based on URL path conventions", () => {
    assert.equal(resolveTtl("/api/admin/features"), TTL_PROFILES.features);
    assert.equal(resolveTtl("/api/admin/appointments/schedule"), TTL_PROFILES.schedule);
    assert.equal(resolveTtl("/api/admin/appointments/closed-dates"), TTL_PROFILES.closedDates);
    assert.equal(resolveTtl("/api/admin/products"), TTL_PROFILES.products);
    assert.equal(resolveTtl("/api/admin/categories"), TTL_PROFILES.categories);
    assert.equal(resolveTtl("/api/admin/content"), TTL_PROFILES.content);
    assert.equal(resolveTtl("/api/admin/coupons"), TTL_PROFILES.coupons);
    assert.equal(resolveTtl("/api/admin/dashboard/summary"), TTL_PROFILES.navigationShort);
    assert.equal(resolveTtl("/api/admin/orders"), TTL_PROFILES.navigationShort);
    assert.equal(resolveTtl("/api/admin/other-endpoint"), TTL_PROFILES.default);
    // Explicit override
    assert.equal(resolveTtl("/api/admin/features", 12345), 12345);
  });

  it("caches successful GET responses and serves cache hits without extra network requests", async () => {
    let networkCallCount = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      networkCallCount++;
      return new Response(JSON.stringify({ success: true, count: networkCallCount }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    try {
      // First call: cache miss
      const res1 = await cachedFetch("/api/admin/products", undefined, 5000);
      assert.equal(res1.status, 200);
      assert.equal(res1.headers.get("x-cache"), null);
      const data1 = await res1.json();
      assert.equal(data1.count, 1);
      assert.equal(networkCallCount, 1);

      // Second call: cache hit
      const res2 = await cachedFetch("/api/admin/products", undefined, 5000);
      assert.equal(res2.status, 200);
      assert.equal(res2.headers.get("x-cache"), "HIT");
      const data2 = await res2.json();
      assert.equal(data2.count, 1);
      assert.equal(networkCallCount, 1); // No new network call!

      // cachedFetchJson helper also reuses cache
      const data3 = await cachedFetchJson("/api/admin/products", undefined, 5000);
      assert.equal(data3.count, 1);
      assert.equal(networkCallCount, 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("coalesces concurrent in-flight requests into a single network call", async () => {
    let networkCallCount = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      networkCallCount++;
      // Simulate 50ms network delay
      await new Promise((resolve) => setTimeout(resolve, 50));
      return new Response(JSON.stringify({ value: "coalesced" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    try {
      // Launch 4 concurrent requests at once
      const [r1, r2, r3, r4] = await Promise.all([
        cachedFetch("/api/admin/features", undefined, 5000),
        cachedFetch("/api/admin/features", undefined, 5000),
        cachedFetch("/api/admin/features", undefined, 5000),
        cachedFetch("/api/admin/features", undefined, 5000),
      ]);

      assert.equal(networkCallCount, 1);
      const json1 = await r1.json();
      const json2 = await r2.json();
      assert.equal(json1.value, "coalesced");
      assert.equal(json2.value, "coalesced");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("invalidates cache by pattern or fully with invalidateCache", async () => {
    let networkCallCount = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      networkCallCount++;
      return new Response(JSON.stringify({ url, count: networkCallCount }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    try {
      await cachedFetch("/api/admin/products", undefined, 5000);
      await cachedFetch("/api/admin/categories", undefined, 5000);
      assert.equal(networkCallCount, 2);

      // Invalidate products only
      invalidateCache("/api/admin/products");

      // Products is a cache miss
      await cachedFetch("/api/admin/products", undefined, 5000);
      assert.equal(networkCallCount, 3);

      // Categories is still a cache hit
      await cachedFetch("/api/admin/categories", undefined, 5000);
      assert.equal(networkCallCount, 3);

      // Full invalidation
      invalidateCache();
      await cachedFetch("/api/admin/categories", undefined, 5000);
      assert.equal(networkCallCount, 4);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("mutation requests bypass cache and auto-invalidate matching paths", async () => {
    let networkCallCount = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      networkCallCount++;
      return new Response(JSON.stringify({ method: init?.method || "GET" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    try {
      // 1. Populate cache for GET
      await cachedFetch("/api/admin/products?limit=10", undefined, 5000);
      assert.equal(networkCallCount, 1);

      // Cache hit
      await cachedFetch("/api/admin/products?limit=10", undefined, 5000);
      assert.equal(networkCallCount, 1);

      // 2. Perform POST mutation
      await cachedFetch("/api/admin/products", { method: "POST", body: "{}" });
      assert.equal(networkCallCount, 2);

      // 3. GET should now re-fetch because POST auto-invalidated /api/admin/products
      await cachedFetch("/api/admin/products?limit=10", undefined, 5000);
      assert.equal(networkCallCount, 3);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
