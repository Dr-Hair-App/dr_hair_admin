import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chromium } from "playwright";

const BASE_URL = process.env.ADMIN_TEST_BASE_URL || "http://localhost:3001";
const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

describe("product editor render regression", () => {
  it("opens the Add Product editor with mocked API data", async (t) => {
    let browser;
    try {
      browser = await chromium.launch({
        executablePath: CHROME_PATH,
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
    } catch (error) {
      t.skip(`Google Chrome is not available for Playwright: ${error.message}`);
      return;
    }

    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      let body = { status: "success", data: {} };

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
        body = { status: "success", data: { items: [], coupons: [] } };
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    });

    try {
      try {
        await page.goto(`${BASE_URL}/catalog`, { waitUntil: "domcontentloaded" });
      } catch (error) {
        if (error.message.includes("ERR_CONNECTION_REFUSED")) {
          t.skip(`Local Admin server is not available at ${BASE_URL}`);
          return;
        }
        throw error;
      }
      await page.getByRole("tab", { name: /Products/ }).click();
      await page.getByRole("button", { name: /Add product/ }).first().click();

      await assert.doesNotReject(async () => {
        await page.getByRole("heading", { name: "Add Medicine / Product" }).waitFor({ state: "visible" });
      });
      assert.deepEqual(pageErrors, [], `Product editor raised browser errors: ${pageErrors.join(" | ")}`);
    } finally {
      await browser.close();
    }
  });
});
