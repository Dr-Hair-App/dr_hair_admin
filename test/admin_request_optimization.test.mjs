import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { cacheableJson, noStoreJson } from "../src/app/api/_lib/backend.ts";

const read = (relPath) => readFile(new URL(relPath, import.meta.url), "utf8");

describe("Admin Panel Request Optimization Verification (Milestone 2)", () => {
  it("cacheableJson emits public Cache-Control headers with TTL and SWR", () => {
    const res = cacheableJson({ status: "ok" }, 60, 300);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("Cache-Control"), "public, max-age=60, stale-while-revalidate=300");
  });

  it("noStoreJson continues to enforce strict no-store headers for private/mutation routes", () => {
    const res = noStoreJson({ error: "Unauthorized" }, 401);
    assert.equal(res.status, 401);
    assert.equal(res.headers.get("Cache-Control"), "no-store, max-age=0");
  });

  it("Admin proxy responses preserve only the backend server request ID", async () => {
    const upstream = Response.json({ ok: true }, {
      headers: {
        "X-Server-Request-ID": "req_123e4567-e89b-12d3-a456-426614174000",
        "X-Internal-Debug": "private",
      },
    });
    const payload = await upstream.json();
    const response = noStoreJson(payload, upstream.status, upstream);

    assert.equal(response.headers.get("X-Server-Request-ID"), "req_123e4567-e89b-12d3-a456-426614174000");
    assert.equal(response.headers.get("X-Internal-Debug"), null);
    assert.equal(response.headers.get("Cache-Control"), "no-store, max-age=0");
  });

  it("noStoreJson rejects caller-controlled or malformed server request IDs", () => {
    const upstream = new Response(null, {
      headers: { "X-Server-Request-ID": "caller-controlled-id" },
    });
    const response = noStoreJson({ ok: true }, 200, upstream);

    assert.equal(response.headers.get("X-Server-Request-ID"), null);
  });

  it("cloudflare.config.ts configures BACKEND_SERVICE binding to dr-hair-backend", async () => {
    const config = await read("../cloudflare.config.ts");
    assert.match(config, /BACKEND_SERVICE:\s*bindings\.worker\(\{\s*worker:\s*["']dr-hair-backend["']\s*\}\)/);
  });

  it("static metadata route handlers return cacheableJson and remove upstream no-store", async () => {
    const featuresRoute = await read("../src/app/api/admin/features/route.ts");
    assert.match(featuresRoute, /cacheableJson/);
    assert.doesNotMatch(featuresRoute, /cache:\s*["']no-store["']/);

    const scheduleRoute = await read("../src/app/api/admin/appointments/schedule/route.ts");
    assert.match(scheduleRoute, /cacheableJson/);
    const scheduleGet = scheduleRoute.slice(scheduleRoute.indexOf("export async function GET"), scheduleRoute.indexOf("export async function PUT"));
    assert.doesNotMatch(scheduleGet, /cache:\s*["']no-store["']/);

    const closedDatesRoute = await read("../src/app/api/admin/appointments/closed-dates/route.ts");
    assert.match(closedDatesRoute, /cacheableJson/);
    const closedDatesGet = closedDatesRoute.slice(closedDatesRoute.indexOf("export async function GET"), closedDatesRoute.indexOf("export async function POST"));
    assert.doesNotMatch(closedDatesGet, /cache:\s*["']no-store["']/);

    const categoriesRoute = await read("../src/app/api/admin/categories/route.ts");
    assert.match(categoriesRoute, /cacheableJson/);
    const categoriesGet = categoriesRoute.slice(categoriesRoute.indexOf("export async function GET"), categoriesRoute.indexOf("export async function POST"));
    assert.doesNotMatch(categoriesGet, /cache:\s*["']no-store["']/);

    const productsRoute = await read("../src/app/api/admin/products/route.ts");
    assert.match(productsRoute, /cacheableJson/);
    const productsGet = productsRoute.slice(productsRoute.indexOf("export async function GET"), productsRoute.indexOf("export async function POST"));
    assert.doesNotMatch(productsGet, /cache:\s*["']no-store["']/);
  });

  it("patient-account-management.tsx implements 350ms search debouncing and min-length guard", async () => {
    const source = await read("../src/features/admin-users/components/patient-account-management.tsx");
    assert.match(source, /debouncedUserSearch/);
    assert.match(source, /350/);
    assert.match(source, /trimmed\.length === 1/);
  });

  it("header-search.tsx implements 350ms debounce, min length 2, and result caching", async () => {
    const source = await read("../src/features/shared/components/header-search.tsx");
    assert.match(source, /350/);
    assert.match(source, /searchCacheRef/);
    assert.match(source, /trimmed\.length < 2/);
  });

  it("hair-tests-page.tsx decouples loadRecords from patientsList dependency", async () => {
    const source = await read("../src/features/operations/components/hair-tests-page.tsx");
    assert.match(source, /patientsListRef/);
    assert.match(source, /\[actor,\s*reportListEndpoint\]/);
  });

  it("orders-page.tsx throttles visibility listener by 60s and gates 5-min polling to active shipping orders", async () => {
    const source = await read("../src/features/operations/components/orders-page.tsx");
    assert.match(source, /lastFetchTimestamp/);
    assert.match(source, /60_000/);
    assert.match(source, /isTerminal/);
    assert.match(source, /isActiveShipping/);
  });

  it("operations-page.tsx skips fetching 100 users on bookings mode unless appointment form is opened", async () => {
    const source = await read("../src/features/operations/components/operations-page.tsx");
    assert.match(source, /!isPatient && !showAppointmentForm/);
  });

  it("operations-page.tsx detaches obsolete appointment-list consumers after navigation", async () => {
    const source = await read("../src/features/operations/components/operations-page.tsx");
    const appointmentEffect = source.slice(
      source.indexOf('cachedFetch(\n          "/api/admin/appointments"'),
      source.indexOf("}, [isPatient, reloadBookings]);"),
    );
    assert.match(appointmentEffect, /\{ signal: controller\.signal \}/);
    assert.match(appointmentEffect, /controller\.signal\.aborted \|\| !response\.ok/);
  });

  it("patient-detail-page.tsx and patient-assessment-detail-page.tsx reuse cached product catalog", async () => {
    const detail = await read("../src/features/operations/components/patient-detail-page.tsx");
    assert.match(detail, /cachedFetch\(\s*["']\/api\/admin\/products["']/);

    const assessment = await read("../src/features/operations/components/patient-assessment-detail-page.tsx");
    assert.match(assessment, /cachedFetch\(\s*["']\/api\/admin\/products["']/);
  });

  it("limits notification-center audit fetch to the activity rows it can display", async () => {
    const center = await read("../src/features/notifications/components/notification-center.tsx");
    assert.match(center, /\["auditEvents", "\/api\/admin\/audit-logs\?limit=20"\]/);
    assert.match(center, /\.slice\(0, 12\)/);
    assert.match(center, /\{ cache: "no-store", signal: controller\.signal \}/, "notification source requests should abort when the center unmounts");
  });

  it("admin-application.tsx only re-fetches dashboard summary on revision if page === 'overview'", async () => {
    const app = await read("../src/features/shared/components/admin-application.tsx");
    assert.match(app, /const hasDashboardSummary = dashboardSummary !== null/);
    assert.match(app, /page !== ["']overview["'] && hasDashboardSummary/);
    assert.match(app, /\[auth\.status, dashboardSummaryRevision, hasDashboardSummary, page\]/);
  });
});
