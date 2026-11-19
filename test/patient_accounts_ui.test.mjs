import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chromium } from "playwright";

const BASE_URL = process.env.ADMIN_TEST_BASE_URL || "http://localhost:3001";
const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

describe("Patient Accounts list UI", () => {
  it("shows API failures clearly and loads patient rows after retry", async (t) => {
    let browser;
    try {
      browser = await chromium.launch({
        executablePath: CHROME_PATH,
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
    } catch (error) {
      t.skip(`Google Chrome is unavailable for Playwright: ${error.message}`);
      return;
    }

    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const pageErrors = [];
    let userListRequests = 0;
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      let status = 200;
      let body = { status: "success", data: {} };

      if (url.pathname === "/api/auth/session") {
        body = {
          authenticated: true,
          admin: { email: "qa@example.test", name: "QA", role: "super_admin", permissions: [] },
        };
      } else if (url.pathname === "/api/admin/features") {
        body = { status: "success", data: { items: [] } };
      } else if (url.pathname === "/api/admin/users/segments") {
        body = {
          status: "success",
          data: {
            accounts_assessments: { total: 1, assessed: 1, not_assessed: 0 },
            product_customers: { total: 0, active_within_days: 30 },
            appointment_treatment: { total: 0 },
          },
        };
      } else if (url.pathname === "/api/admin/users") {
        userListRequests += 1;
        if (userListRequests === 1) {
          status = 403;
          body = { status: "error", message: "Patient lookup permission is required." };
        } else {
          body = {
            status: "success",
            data: {
              items: [{
                id: 812,
                patient_code: "DHP0812",
                name: "Synthetic Patient Account",
                email: "patient@example.test",
                phone: "9000000812",
                status: "active",
                is_blocked: false,
                created_at: "2026-11-18T10:00:00.000Z",
                has_completed_assessment: true,
              }],
              total: 1,
              page: 1,
              limit: 25,
            },
          };
        }
      }

      await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    });

    try {
      try {
        await page.goto(`${BASE_URL}/activity`, { waitUntil: "domcontentloaded", timeout: 15000 });
      } catch (error) {
        if (error.message.includes("ERR_CONNECTION_REFUSED")) {
          t.skip(`Local Admin server is unavailable at ${BASE_URL}`);
          return;
        }
        throw error;
      }

      await page.getByRole("heading", { name: "Patient accounts", exact: true }).waitFor({ state: "visible" });
      const alert = page.getByRole("alert").filter({ hasText: "Patient lookup permission is required." });
      await alert.waitFor({ state: "visible" });
      assert.match(await page.locator("body").innerText(), /Patient accounts could not be loaded/);
      assert.doesNotMatch(await page.locator("body").innerText(), /No patient accounts are registered yet/);

      await alert.getByRole("button", { name: "Retry" }).click();
      await page.getByText("Synthetic Patient Account", { exact: true }).first().waitFor({ state: "visible" });
      assert.equal(userListRequests, 2);
      assert.deepEqual(pageErrors, []);
    } finally {
      await context.close();
      await browser.close();
    }
  });
});
