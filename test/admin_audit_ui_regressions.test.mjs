import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { chromium } from "playwright";

const BASE_URL = process.env.ADMIN_TEST_BASE_URL || "http://localhost:3001";
const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
let browser;

before(async (context) => {
  try {
    browser = await chromium.launch({
      executablePath: CHROME_PATH,
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  } catch (error) {
    context.skip(`Google Chrome is unavailable for Playwright: ${error.message}`);
  }
});

after(async () => {
  await browser?.close();
});

async function newAdminPage(pageName, { failNotificationHistoryOnce = false, failAudienceCountOnce = false, adminRole = "super_admin", adminPermissions = [] } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const pageErrors = [];
  const apiRequests = [];
  let apiTrafficPageTwoReads = 0;
  let apiTrafficShrunk = false;
  let notificationHistoryReads = 0;
  let audienceCountReads = 0;
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/")) apiRequests.push(url.toString());
  });

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    let status = 200;
    let body = { status: "success", data: { items: [] } };

    if (url.pathname === "/api/auth/session") {
      body = {
        authenticated: true,
        admin: { email: "qa@example.test", name: "QA", role: adminRole, permissions: adminPermissions },
      };
    } else if (url.pathname === "/api/admin/features") {
      body = {
        status: "success",
        data: {
          items: ["patients", "catalog", "content", "orders", "bookings", "tests"]
            .map((key) => ({ key: `admin_${key}`, enabled: true })),
        },
      };
    } else if (url.pathname === "/api/admin/notifications" && url.searchParams.get("action") === "audience-count") {
      audienceCountReads += 1;
      if (failAudienceCountOnce && audienceCountReads === 1) {
        status = 503;
        body = { status: "error", message: "Mock audience count outage", data: null };
      } else {
        body = { status: "success", data: { targetCount: 12 } };
      }
    } else if (url.pathname === "/api/admin/notifications" && url.searchParams.has("page")) {
      notificationHistoryReads += 1;
      if (failNotificationHistoryOnce && notificationHistoryReads === 1) {
        status = 503;
        body = { status: "error", message: "Mock notification history outage", data: null };
      } else {
        body = { status: "success", data: { items: [] } };
      }
    } else if (url.pathname === "/api/admin/products") {
      body = { status: "success", data: { items: [] } };
    } else if (url.pathname === "/api/admin/coupons") {
      body = { status: "success", data: { coupons: [], items: [] } };
    } else if (url.pathname === "/api/admin/dashboard/summary") {
      body = { status: "success", data: { counts: {}, recentActivity: [] } };
    } else if (url.pathname === "/api/admin/api-traffic") {
      const secondPage = url.searchParams.get("page") === "2";
      const statusFilter = url.searchParams.get("statusClass");
      if (statusFilter === "4xx") {
        status = 503;
        body = { status: "error", message: "Mock API traffic service outage", data: null };
      } else if (secondPage) {
        apiTrafficPageTwoReads += 1;
        if (apiTrafficPageTwoReads > 1) {
          apiTrafficShrunk = true;
          body = { status: "success", data: { items: [] }, meta: { page: 2, limit: 100, total: 1, total_pages: 1 } };
        } else {
          const item = { id: "api-qa-2", request_id: "req_123e4567-e89b-12d3-a456-426614174001", surface: "/api/v1/admin", method: "PATCH", route: "/orders/:orderId", status: 500, duration_ms: 120.5, cache_control: "private, no-store", created_at: "2026-11-21T09:00:00.000Z" };
          body = { status: "success", data: { items: [item] }, meta: { page: 2, limit: 100, total: 101, total_pages: 2 } };
        }
      } else if (apiTrafficShrunk) {
        const item = { id: "api-qa-1", request_id: "req_123e4567-e89b-12d3-a456-426614174000", surface: "/api/v1/admin", method: "GET", route: "/users/:userId", status: 503, duration_ms: 84.2, cache_control: "private, no-store", created_at: "2026-11-21T10:00:00.000Z" };
        body = { status: "success", data: { items: [item] }, meta: { page: 1, limit: 100, total: 1, total_pages: 1 } };
      } else {
      const item = secondPage
        ? { id: "api-qa-2", request_id: "req_123e4567-e89b-12d3-a456-426614174001", surface: "/api/v1/admin", method: "PATCH", route: "/orders/:orderId", status: 500, duration_ms: 120.5, cache_control: "private, no-store", created_at: "2026-11-21T09:00:00.000Z" }
        : { id: "api-qa-1", request_id: "req_123e4567-e89b-12d3-a456-426614174000", surface: "/api/v1/admin", method: "GET", route: "/users/:userId", status: 503, duration_ms: 84.2, cache_control: "private, no-store", created_at: "2026-11-21T10:00:00.000Z" };
      body = { status: "success", data: { items: [item] }, meta: { page: 1, limit: 100, total: 101, total_pages: 2 } };
      }
    } else if (url.pathname === "/api/admin/users") {
      body = { status: "success", data: { items: [{ id: "qa-patient-1", name: "Synthetic QA Patient", patient_code: "DHP-QA-01" }] } };
    } else if (url.pathname === "/api/admin/hair-tests") {
      body = {
        status: "success",
        data: {
          items: [{
            id: 1,
            reference_no: "HT-QA-01",
            userId: "qa-patient-1",
            full_name: "Synthetic QA Patient",
            main_concern: "Hair shedding",
            hair_loss_stage: "Stage 2",
            status: "submitted",
            created_at: "2026-11-18T10:00:00.000Z",
            scalp_photos: [{ file_name: "front.webp", mime_type: "image/webp", bytes: 9999 }],
          }],
        },
      };
    } else if (url.pathname === "/api/admin/reports") {
      body = {
        status: "success",
        data: { reports: [{ id: "rpt-qa", userId: "qa-patient-1", title: "Private QA report", visibility: "Private", bytes: 0 }] },
      };
    } else if (url.pathname === "/api/admin/orders") {
      status = 503;
      body = { status: "error", message: "Mock order service outage", data: null };
    } else if (url.pathname === "/api/admin/payments") {
      status = 503;
      body = { status: "error", message: "Mock payment service outage", data: null };
    } else if (url.pathname === "/api/admin/health") {
      status = 503;
      body = { available: false, message: "Mock backend unavailable" };
    }

    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });

  await page.goto(`${BASE_URL}${pageName}`, { waitUntil: "domcontentloaded", timeout: 15000 });
  return { context, page, pageErrors, apiRequests };
}

describe("Admin audit UI regressions (mocked API only)", () => {
  it("explains a session-check outage instead of silently treating it as signed out", async (t) => {
    if (!browser) return t.skip("Browser could not start.");
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.route("**/api/auth/session", async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ authenticated: false, message: "Mock sign-in service unavailable" }),
      });
    });

    try {
      await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded", timeout: 15000 });
      await page.getByRole("status").filter({ hasText: "Mock sign-in service unavailable" }).waitFor({ state: "visible" });
      await page.getByRole("button", { name: "Sign in to workspace" }).waitFor({ state: "visible" });
      assert.deepEqual(pageErrors, []);
    } finally {
      await context.close();
    }
  });

  it("maps canonical assessment data and actual photo bytes without counting private reports as approved", async (t) => {
    if (!browser) return t.skip("Browser could not start.");
    const { context, page, pageErrors } = await newAdminPage("/tests");
    try {
      await page.getByText("10 KB").waitFor({ state: "visible" });
      await page.getByText(/1 waiting for doctor review/).waitFor({ state: "visible" });
      const queueSummary = await page.locator("text=/waiting for doctor review/").first().textContent();
      assert.match(queueSummary || "", /0 approved to share/);
      assert.deepEqual(pageErrors, []);
    } finally {
      await context.close();
    }
  });

  it("renders patient assessment notifications from canonical backend fields", async (t) => {
    if (!browser) return t.skip("Browser could not start.");
    const { context, page, pageErrors, apiRequests } = await newAdminPage("/notifications");
    try {
      await page.getByRole("button", { name: /Patient assessment needs review/ }).waitFor({ state: "visible" });
      const notification = page.getByRole("button", { name: /Patient assessment needs review/ }).first();
      const label = await notification.getAttribute("aria-label");
      assert.match(label || "", /Synthetic QA Patient/);
      assert.match(label || "", /Hair shedding|Stage 2/);
      assert.doesNotMatch(label || "", /Details unavailable/);
      const sourcePaths = [
        "/api/admin/appointments",
        "/api/admin/orders",
        "/api/admin/hair-tests",
        "/api/admin/reports",
        "/api/admin/audit-logs",
      ];
      for (const sourcePath of sourcePaths) {
        const requests = apiRequests.filter((value) => new URL(value).pathname === sourcePath);
        assert.equal(requests.length, 1, `${sourcePath} should be requested once per notification-center load`);
      }
      const auditRequest = new URL(apiRequests.find((value) => new URL(value).pathname === "/api/admin/audit-logs"));
      assert.equal(auditRequest.searchParams.get("limit"), "20");
      assert.deepEqual(pageErrors, []);
    } finally {
      await context.close();
    }
  });

  it("shows retryable order and payment failures instead of a false empty/zero state", async (t) => {
    if (!browser) return t.skip("Browser could not start.");
    const { context, page, pageErrors } = await newAdminPage("/orders");
    try {
      await page.getByRole("alert").filter({ hasText: "Mock order service outage" }).waitFor({ state: "visible" });
      await page.getByRole("button", { name: /Retry/i }).waitFor({ state: "visible" });
      await page.getByRole("tab", { name: /Received Payments/ }).click();
      await page.getByRole("alert").filter({ hasText: "Mock payment service outage" }).waitFor({ state: "visible" });
      await page.getByRole("button", { name: /Retry loading payments/i }).waitFor({ state: "visible" });
      assert.deepEqual(pageErrors, []);
    } finally {
      await context.close();
    }
  });

  it("debounces universal search into one request per resource for rapid typing", async (t) => {
    if (!browser) return t.skip("Browser could not start.");
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const pageErrors = [];
    const searches = { users: 0, products: 0, appointments: 0 };
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.has("search")) {
        if (url.pathname === "/api/admin/users") searches.users += 1;
        if (url.pathname === "/api/admin/products") searches.products += 1;
        if (url.pathname === "/api/admin/appointments") searches.appointments += 1;
      }
      let body = { status: "success", data: { items: [] } };
      if (url.pathname === "/api/auth/session") {
        body = { authenticated: true, admin: { email: "qa@example.test", name: "QA", role: "super_admin", permissions: [] } };
      } else if (url.pathname === "/api/admin/features") {
        body = { status: "success", data: { items: ["patients", "catalog", "content", "orders", "bookings", "tests"].map((key) => ({ key: `admin_${key}`, enabled: true })) } };
      } else if (url.pathname === "/api/admin/dashboard/summary") {
        body = { status: "success", data: { counts: {}, recentActivity: [] } };
      } else if (url.pathname === "/api/admin/products") {
        body = { status: "success", data: { items: [] } };
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    });

    try {
      await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded", timeout: 15000 });
      const input = page.getByRole("textbox", { name: "Universal admin search" });
      await input.click();
      await input.pressSequentially("qa-flow", { delay: 10 });
      await page.waitForTimeout(550);
      assert.deepEqual(searches, { users: 1, products: 1, appointments: 1 });
      assert.deepEqual(pageErrors, []);
    } finally {
      await context.close();
    }
  });

  it("generates admin passwords in the browser without submitting the account form", async (t) => {
    if (!browser) return t.skip("Browser could not start.");
    const { context, page, pageErrors } = await newAdminPage("/team");
    try {
      const password = page.getByLabel("Admin login password");
      await page.getByRole("button", { name: "Generate a strong password" }).click();
      const generated = await password.inputValue();
      assert.equal(generated.length, 14);
      assert.match(generated, /^[abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*]{14}$/);
      assert.deepEqual(pageErrors, []);
    } finally {
      await context.close();
    }
  });

  it("shows empty Home banners from the API without resurrecting seeded claims", async (t) => {
    if (!browser) return t.skip("Browser could not start.");
    const { context, page, pageErrors } = await newAdminPage("/content");
    try {
      await page.getByRole("tab", { name: "Home screen" }).click();
      await page.getByText("No banners match the selected filters.").waitFor({ state: "visible" });
      const text = await page.locator("body").innerText();
      assert.doesNotMatch(text, /FDA-approved active ingredients|Doctor-Formulated Regrowth Kits/);
      assert.deepEqual(pageErrors, []);
    } finally {
      await context.close();
    }
  });

  it("shows notification history failures instead of a false empty state and recovers on retry", async (t) => {
    if (!browser) return t.skip("Browser could not start.");
    const { context, page, pageErrors, apiRequests } = await newAdminPage("/content", { failNotificationHistoryOnce: true });
    try {
      await page.getByRole("tab", { name: "Notifications" }).click();
      await page.getByRole("alert").filter({ hasText: "Mock notification history outage" }).waitFor({ state: "visible" });
      assert.equal(await page.getByText("No notifications recorded yet.").count(), 0);
      await page.getByRole("button", { name: "Try again" }).click();
      await page.getByText("No notifications recorded yet.").waitFor({ state: "visible" });
      assert.ok(apiRequests.filter((request) => new URL(request).pathname === "/api/admin/notifications" && new URL(request).searchParams.has("page")).length >= 2);
      assert.deepEqual(pageErrors, []);
    } finally {
      await context.close();
    }
  });

  it("does not report an audience service failure as zero eligible patients", async (t) => {
    if (!browser) return t.skip("Browser could not start.");
    const { context, page, pageErrors, apiRequests } = await newAdminPage("/content", { failAudienceCountOnce: true });
    try {
      await page.getByRole("tab", { name: "Notifications" }).click();
      await page.getByRole("alert").filter({ hasText: "Mock audience count outage" }).waitFor({ state: "visible" });
      assert.equal(await page.getByText(/0 eligible devices/).count(), 0);
      await page.getByRole("button", { name: "Retry" }).click();
      await page.getByText(/12 eligible devices/).waitFor({ state: "visible" });
      assert.ok(apiRequests.filter((request) => new URL(request).searchParams.get("action") === "audience-count").length >= 2);
      assert.deepEqual(pageErrors, []);
    } finally {
      await context.close();
    }
  });

  it("shows icon-only App Management tabs on mobile and icon plus text on desktop", async (t) => {
    if (!browser) return t.skip("Browser could not start.");
    const { context, page, pageErrors } = await newAdminPage("/content");
    try {
      const homeTab = page.getByRole("tab", { name: "Home screen" });
      const homeLabel = homeTab.locator(".app-management-tab-label");
      await page.setViewportSize({ width: 320, height: 720 });
      await homeTab.waitFor({ state: "visible" });
      assert.equal(await homeLabel.isVisible(), false, "narrow mobile should hide the tab text");
      assert.equal(await homeTab.locator("svg").isVisible(), true, "narrow mobile should retain tab icons");
      await page.setViewportSize({ width: 390, height: 844 });
      await homeTab.waitFor({ state: "visible" });
      assert.equal(await homeLabel.isVisible(), false, "mobile should hide the tab text");
      assert.equal(await homeTab.getAttribute("aria-label"), "Home screen", "icon-only tabs keep an accessible name");
      assert.equal(await homeTab.locator("svg").isVisible(), true, "mobile should keep the tab icon visible");

      await page.setViewportSize({ width: 1280, height: 800 });
      assert.equal(await homeLabel.isVisible(), true, "desktop should show the tab text");
      assert.equal(await homeTab.locator("svg").isVisible(), true, "desktop should show the tab icon");
      const labelStyle = await homeLabel.evaluate((element) => {
        const style = getComputedStyle(element);
        return { backgroundColor: style.backgroundColor, padding: style.padding, fontSize: style.fontSize };
      });
      assert.equal(labelStyle.backgroundColor, "rgba(0, 0, 0, 0)", "tab labels should not inherit numeric count badge styling");
      assert.equal(labelStyle.padding, "0px", "tab labels should keep natural inline spacing");
      assert.deepEqual(pageErrors, []);
    } finally {
      await context.close();
    }
  });

  it("shows API traffic metadata and applies the status filter", async (t) => {
    if (!browser) return t.skip("Browser could not start.");
    const { context, page, pageErrors, apiRequests } = await newAdminPage("/apiTraffic");
    try {
      await page.getByText("/users/:userId").waitFor({ state: "visible" });
      await page.getByText("84.2 ms").waitFor({ state: "visible" });
      await page.evaluate(() => fetch("/api/admin/users/Patient%20Name/reports/private-123?email=private%40example.test", { cache: "no-store" }));
      await page.getByText("/api/admin/users/:id/reports/:id", { exact: true }).waitFor({ state: "visible" });
      const diagnostics = await page.getByRole("region", { name: "This tab request diagnostics" }).innerText();
      assert.match(diagnostics, /ApiTraffic/i);
      assert.match(diagnostics, /200/);
      assert.match(diagnostics, /network/);
      assert.doesNotMatch(diagnostics, /Patient Name|private-123|private@example\.test/);
      await page.getByLabel("Status filter").selectOption("4xx");
      await page.getByRole("alert").filter({ hasText: "Mock API traffic service outage" }).waitFor({ state: "visible" });
      assert.equal(await page.getByText("/users/:userId").count(), 0, "failed filters must not leave stale rows visible");
      assert.equal(await page.getByText("101 requests in this window").count(), 0, "failed filters must not leave a stale total visible");
      await page.getByLabel("Status filter").selectOption("5xx");
      await page.getByText("/users/:userId").waitFor({ state: "visible" });
      const requests = apiRequests.filter((request) => new URL(request).pathname === "/api/admin/api-traffic");
      assert.ok(requests.some((request) => new URL(request).searchParams.get("statusClass") === "5xx"));
      await page.getByRole("button", { name: "Next" }).click();
      await page.getByText("/orders/:orderId").waitFor({ state: "visible" });
      assert.ok(requests.concat(apiRequests.filter((request) => new URL(request).pathname === "/api/admin/api-traffic"))
        .some((request) => new URL(request).searchParams.get("page") === "2"));
      await page.getByRole("button", { name: "Refresh" }).click();
      await page.getByText("/users/:userId").waitFor({ state: "visible" });
      await page.getByText("Page 1 of 2").waitFor({ state: "hidden" });
      assert.equal(await page.getByText("/orders/:orderId").count(), 0, "a shrinking history should return to the last valid page");
      const trafficRequests = apiRequests.filter((request) => new URL(request).pathname === "/api/admin/api-traffic");
      assert.equal(new URL(trafficRequests.at(-1)).searchParams.get("page"), "1");
      assert.deepEqual(pageErrors, []);
    } finally {
      await context.close();
    }
  });

  it("requires an active catalog product before enabling a product notification destination", async (t) => {
    if (!browser) return t.skip("Browser could not start.");
    const { context, page, pageErrors } = await newAdminPage("/content");
    try {
      await page.getByRole("tab", { name: "Notifications" }).click();
      await page.getByLabel("App Deep Link Destination").selectOption("product");
      const destination = page.getByLabel("Product destination");
      await destination.waitFor({ state: "visible" });
      assert.equal(await destination.inputValue(), "");
      assert.equal(await destination.isDisabled(), true);
      await page.getByRole("button", { name: /Send Push Notification/ }).waitFor({ state: "visible" });
      assert.equal(await page.getByRole("button", { name: /Send Push Notification/ }).isDisabled(), true);
      assert.deepEqual(pageErrors, []);
    } finally {
      await context.close();
    }
  });

  it("loads commerce data only for the selected commerce screen", async (t) => {
    if (!browser) return t.skip("Browser could not start.");
    const { context, page, pageErrors, apiRequests } = await newAdminPage("/catalog");
    try {
      await page.getByText("Store performance").waitFor({ state: "visible" });
      const requestsFor = (path) => apiRequests.filter((request) => new URL(request).pathname === path);
      assert.equal(requestsFor("/api/admin/orders").length, 0, "the inactive Orders tab should not load orders on the overview screen");
      assert.equal(requestsFor("/api/admin/payments").length, 0, "the inactive Orders tab should not load payments on the overview screen");
      assert.equal(requestsFor("/api/admin/products").length, 1, "overview product metrics should use one product list request");
      assert.equal(requestsFor("/api/admin/coupons").length, 1, "overview coupon metric should use one coupon list request");
      await page.getByRole("tab", { name: "Orders" }).click();
      await page.getByRole("heading", { name: "Orders & Payments" }).waitFor({ state: "visible" });
      await page.waitForFunction(() => performance.getEntriesByType("resource").some((entry) => entry.name.includes("/api/admin/orders")));
      assert.ok(requestsFor("/api/admin/orders").length >= 1, "orders should load when their tab is selected");
      assert.deepEqual(pageErrors, []);
    } finally {
      await context.close();
    }
  });

  it("keeps an orders-only commerce admin out of catalog APIs and sections", async (t) => {
    if (!browser) return t.skip("Browser could not start.");
    const { context, page, pageErrors, apiRequests } = await newAdminPage("/catalog", { adminRole: "admin", adminPermissions: ["orders.manage"] });
    try {
      await page.getByText("Store performance").waitFor({ state: "visible" });
      assert.equal(await page.getByText("Revenue, payment trends, and order reporting for your clinic.").count(), 1);
      assert.equal(await page.getByText("Revenue, orders, inventory health, and store analytics.").count(), 0);
      await page.getByRole("tab", { name: "Orders" }).waitFor({ state: "visible" });
      assert.equal(await page.getByRole("tab", { name: "Products" }).count(), 0);
      assert.equal(await page.getByRole("tab", { name: "Coupons" }).count(), 0);
      assert.equal(await page.getByText("No product performance data is available.").count(), 0);
      assert.equal(await page.getByText(/active coupon codes available/).count(), 0);
      const catalogRequests = apiRequests.filter((request) => ["/api/admin/products", "/api/admin/coupons"].includes(new URL(request).pathname));
      assert.deepEqual(catalogRequests, [], "orders-only admins should not call product or coupon APIs");
      await page.getByRole("tab", { name: "Orders" }).click();
      await page.getByRole("heading", { name: "Orders & Payments" }).waitFor({ state: "visible" });
      assert.ok(apiRequests.some((request) => new URL(request).pathname === "/api/admin/orders"));
      assert.deepEqual(pageErrors, []);
    } finally {
      await context.close();
    }
  });

  it("shows unavailable backend health instead of a hardcoded connected indicator", async (t) => {
    if (!browser) return t.skip("Browser could not start.");
    const { context, page, pageErrors } = await newAdminPage("/");
    try {
      await page.getByRole("button", { name: "Settings" }).click();
      await page.getByText("Backend is unavailable").waitFor({ state: "visible" });
      assert.deepEqual(pageErrors, []);
    } finally {
      await context.close();
    }
  });
});
