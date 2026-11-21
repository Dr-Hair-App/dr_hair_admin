import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  cachedFetch,
  cachedFetchJson,
  invalidateCache,
  clearCache,
  setCacheSessionScope,
  resolveTtl,
  TTL_PROFILES,
  getCacheStats,
} from "../src/features/shared/lib/api-cache.ts";
import {
  clearAdminRequestRecords,
  getAdminRequestRecords,
  recordAdminRequest,
  sanitizeAdminRoute,
  setAdminRequestView,
} from "../src/features/shared/lib/admin-request-recorder.ts";

describe("api-cache.ts Client-Side Request Cache Utility", () => {
  beforeEach(() => {
    setCacheSessionScope(null);
    clearCache();
    clearAdminRequestRecords();
    setAdminRequestView("overview");
  });

  it("sanitizes request routes and excludes queries, IDs, names, and non-Admin APIs", () => {
    assert.equal(
      sanitizeAdminRoute("https://admin.example/api/admin/users/qa-patient-123/reports/private-report-9/download?email=secret%40example.test"),
      "/api/admin/users/:id/reports/:id/download",
    );
    assert.equal(
      sanitizeAdminRoute("/api/admin/users/Patient%20Name/assessments/HT-QA-91/photos/2?token=hidden"),
      "/api/admin/users/:id/assessments/:id/photos/:index",
    );
    assert.equal(sanitizeAdminRoute("/api/auth/session?token=secret"), null);
    assert.equal(sanitizeAdminRoute("/api/admin/api-traffic?search=private"), null);

    recordAdminRequest({ url: "/api/admin/orders/order-123?patient=private", view: "orders", method: "get", status: 200, durationMs: 12.34, cacheOutcome: "network" });
    const [record] = getAdminRequestRecords();
    assert.equal(record.route, "/api/admin/orders/:id");
    assert.equal(record.view, "orders");
    assert.equal(record.method, "GET");
    assert.equal(record.status, 200);
    assert.equal(record.duration_ms, 12.3);
    assert.equal(JSON.stringify(record).includes("private"), false);
    assert.equal(JSON.stringify(record).includes("order-123"), false);
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
      setAdminRequestView("products");
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
      const recorded = getAdminRequestRecords();
      assert.deepEqual(recorded.slice(0, 4).map((entry) => entry.cache_outcome), ["hit", "hit", "miss"]);
      assert.ok(recorded.every((entry) => entry.view === "products"));
      assert.ok(recorded.every((entry) => entry.route === "/api/admin/products"));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("isolates cookie-authenticated cache entries when the admin identity changes", async () => {
    let networkCallCount = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      networkCallCount++;
      return new Response(JSON.stringify({ count: networkCallCount }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    try {
      setCacheSessionScope("admin-a");
      const firstAdminResponse = await cachedFetch("/api/admin/users", undefined, 5000);
      assert.equal((await firstAdminResponse.json()).count, 1);
      await cachedFetch("/api/admin/users", undefined, 5000);
      assert.equal(networkCallCount, 1, "same admin should reuse the fresh cache entry");

      setCacheSessionScope("admin-b");
      const secondAdminResponse = await cachedFetch("/api/admin/users", undefined, 5000);
      assert.equal((await secondAdminResponse.json()).count, 2);
      assert.equal(networkCallCount, 2, "a different admin must make a fresh request");
    } finally {
      setCacheSessionScope(null);
      globalThis.fetch = originalFetch;
    }
  });

  it("does not let an old identity's in-flight response overwrite the new identity cache", async () => {
    let networkCallCount = 0;
    let releaseFirstRequest;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      networkCallCount++;
      if (networkCallCount === 1) {
        return new Promise((resolve) => {
          releaseFirstRequest = () => resolve(new Response(JSON.stringify({ identity: "admin-a" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }));
        });
      }
      return new Response(JSON.stringify({ identity: "admin-b" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    try {
      setCacheSessionScope("admin-a");
      const oldIdentityRequest = cachedFetch("/api/admin/users", undefined, 5000);
      assert.equal(networkCallCount, 1);

      setCacheSessionScope("admin-b");
      const newIdentityResponse = await cachedFetch("/api/admin/users", undefined, 5000);
      assert.equal((await newIdentityResponse.json()).identity, "admin-b");
      releaseFirstRequest?.();
      assert.equal((await (await oldIdentityRequest).json()).identity, "admin-a");

      const cachedNewIdentityResponse = await cachedFetch("/api/admin/users", undefined, 5000);
      assert.equal((await cachedNewIdentityResponse.json()).identity, "admin-b");
      assert.equal(networkCallCount, 2);
    } finally {
      setCacheSessionScope(null);
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
      const outcomes = getAdminRequestRecords().map((entry) => entry.cache_outcome).sort();
      assert.deepEqual(outcomes, ["coalesced", "coalesced", "coalesced", "miss"]);
      const json1 = await r1.json();
      const json2 = await r2.json();
      assert.equal(json1.value, "coalesced");
      assert.equal(json2.value, "coalesced");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("aborts a foreground network request when its only consumer leaves", async () => {
    let networkCallCount = 0;
    let networkSignal;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (_url, init) => {
      networkCallCount++;
      networkSignal = init?.signal;
      if (networkCallCount === 1) {
        return new Promise((_resolve, reject) => {
          networkSignal.addEventListener("abort", () => {
            const error = new Error("The operation was aborted.");
            error.name = "AbortError";
            reject(error);
          }, { once: true });
        });
      }
      return new Response(JSON.stringify({ fresh: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    try {
      const consumer = new AbortController();
      const abandonedRequest = cachedFetch("/api/admin/appointments", { signal: consumer.signal }, 5000);
      consumer.abort();
      await assert.rejects(abandonedRequest, { name: "AbortError" });
      assert.equal(networkSignal.aborted, true, "underlying fetch should be aborted after the final consumer leaves");

      const retry = await cachedFetch("/api/admin/appointments", undefined, 5000);
      assert.deepEqual(await retry.json(), { fresh: true });
      assert.equal(networkCallCount, 2, "a retry should start a new network request, not join the abandoned one");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("keeps a coalesced network request alive while another consumer remains", async () => {
    let networkCallCount = 0;
    let networkSignal;
    let resolveNetwork;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (_url, init) => {
      networkCallCount++;
      networkSignal = init?.signal;
      return new Promise((resolve) => {
        resolveNetwork = () => resolve(new Response(JSON.stringify({ shared: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }));
      });
    };

    try {
      const leavingConsumer = new AbortController();
      const activeConsumer = new AbortController();
      const abandonedRequest = cachedFetch("/api/admin/appointments", { signal: leavingConsumer.signal }, 5000);
      const activeRequest = cachedFetch("/api/admin/appointments", { signal: activeConsumer.signal }, 5000);
      assert.equal(networkCallCount, 1, "identical requests should still be coalesced");

      leavingConsumer.abort();
      await assert.rejects(abandonedRequest, { name: "AbortError" });
      assert.equal(networkSignal.aborted, false, "the remaining consumer must keep the shared fetch alive");

      resolveNetwork();
      const response = await activeRequest;
      assert.deepEqual(await response.json(), { shared: true });
      assert.equal(networkCallCount, 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("still aborts an abandoned older request after force-refresh replaces its cache slot", async () => {
    const networkSignals = [];
    const releaseRequests = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (_url, init) => {
      networkSignals.push(init?.signal);
      return new Promise((resolve, reject) => {
        const signal = init?.signal;
        signal.addEventListener("abort", () => {
          const error = new Error("The operation was aborted.");
          error.name = "AbortError";
          reject(error);
        }, { once: true });
        releaseRequests.push(() => resolve(new Response(JSON.stringify({ request: releaseRequests.length }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })));
      });
    };

    try {
      const firstConsumer = new AbortController();
      const abandonedRequest = cachedFetch("/api/admin/appointments", { signal: firstConsumer.signal }, 5000);
      const refreshedRequest = cachedFetch("/api/admin/appointments", undefined, 5000, { forceRefresh: true });
      assert.equal(networkSignals.length, 2, "force refresh should start its own request");

      firstConsumer.abort();
      await assert.rejects(abandonedRequest, { name: "AbortError" });
      assert.equal(networkSignals[0].aborted, true, "the replaced request should still be cancelled after its consumer leaves");
      assert.equal(networkSignals[1].aborted, false, "aborting the replaced request must not affect the refresh");

      releaseRequests[1]();
      const response = await refreshedRequest;
      assert.deepEqual(await response.json(), { request: 2 });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("keeps SWR revalidation alive without foreground consumers", async () => {
    let networkCallCount = 0;
    let revalidationSignal;
    let resolveRevalidation;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (_url, init) => {
      networkCallCount++;
      if (networkCallCount === 1) {
        return new Response(JSON.stringify({ value: "cached" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      revalidationSignal = init?.signal;
      return new Promise((resolve) => {
        resolveRevalidation = () => resolve(new Response(JSON.stringify({ value: "updated" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }));
      });
    };

    try {
      const first = await cachedFetch("/api/admin/features", undefined, 5, { swrMs: 5000 });
      assert.deepEqual(await first.json(), { value: "cached" });
      await new Promise((resolve) => setTimeout(resolve, 15));

      const stale = await cachedFetch("/api/admin/features", undefined, 5, { swrMs: 5000 });
      assert.equal(stale.headers.get("x-cache"), "STALE");
      assert.equal(networkCallCount, 2);
      assert.equal(revalidationSignal.aborted, false, "background SWR fetch must survive with no waiting caller");

      resolveRevalidation();
      await new Promise((resolve) => setTimeout(resolve, 0));
      const updated = await cachedFetch("/api/admin/features", undefined, 5, { swrMs: 5000 });
      assert.deepEqual(await updated.json(), { value: "updated" });
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
