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

async function newAdminPage(pageName) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    let status = 200;
    let body = { status: "success", data: { items: [] } };

    if (url.pathname === "/api/auth/session") {
      body = {
        authenticated: true,
        admin: { email: "qa@example.test", name: "QA", role: "super_admin", permissions: [] },
      };
    } else if (url.pathname === "/api/admin/features") {
      body = {
        status: "success",
        data: {
          items: ["patients", "catalog", "content", "orders", "bookings", "tests"]
            .map((key) => ({ key: `admin_${key}`, enabled: true })),
        },
      };
    } else if (url.pathname === "/api/admin/products") {
      body = { status: "success", data: { items: [] } };
    } else if (url.pathname === "/api/admin/coupons") {
      body = { status: "success", data: { coupons: [], items: [] } };
    } else if (url.pathname === "/api/admin/dashboard/summary") {
      body = { status: "success", data: { counts: {}, recentActivity: [] } };
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
  return { context, page, pageErrors };
}

describe("Admin audit UI regressions (mocked API only)", () => {
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
    const { context, page, pageErrors } = await newAdminPage("/notifications");
    try {
      await page.getByRole("button", { name: /Patient assessment needs review/ }).waitFor({ state: "visible" });
      const notification = page.getByRole("button", { name: /Patient assessment needs review/ }).first();
      const label = await notification.getAttribute("aria-label");
      assert.match(label || "", /Synthetic QA Patient/);
      assert.match(label || "", /Hair shedding|Stage 2/);
      assert.doesNotMatch(label || "", /Details unavailable/);
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
