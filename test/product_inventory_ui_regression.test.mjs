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

async function openCatalog(t, inventoryHandler, getStock = () => 20) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    let status = 200;
    let body = { status: "success", data: { items: [] } };

    if (url.pathname === "/api/auth/session") {
      body = { authenticated: true, admin: { email: "qa@example.test", name: "QA", role: "super_admin", permissions: ["products.manage"] } };
    } else if (url.pathname === "/api/admin/features") {
      body = { status: "success", data: { items: ["catalog"].map((key) => ({ key: `admin_${key}`, enabled: true })) } };
    } else if (url.pathname === "/api/admin/products" && route.request().method() === "GET") {
      body = {
        status: "success",
        data: {
          items: [{
            id: "qa-inventory-product",
            name: "Synthetic Inventory Product",
            category: "Hair Care",
            sku: "QA-STOCK-01",
            price: 1000,
            compareAtPrice: 1200,
            stock: getStock(),
            status: "Active",
            unitsSold: 0,
            revenue: 0,
            media: [],
            rootCauses: ["Hair loss"],
            supplyPlans: [{ id: "qa-plan", title: "Monthly", subtitle: "Standard pack", sku: "QA-STOCK-01", price: 1000, mrp: 1200, stock: getStock(), badge: "" }],
          }],
        },
      };
    } else if (url.pathname === "/api/admin/products/qa-inventory-product/inventory" && inventoryHandler) {
      await inventoryHandler(route);
      return;
    }

    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });

  try {
    await page.goto(`${BASE_URL}/catalog`, { waitUntil: "domcontentloaded", timeout: 15000 });
  } catch (error) {
    await context.close();
    if (error.message.includes("ERR_CONNECTION_REFUSED")) {
      t.skip(`Local Admin server is not available at ${BASE_URL}`);
      return null;
    }
    throw error;
  }
  await page.getByRole("tab", { name: /Products/ }).click();
  await page.waitForTimeout(800);
  const pageText = await page.locator("body").innerText();
  assert.match(pageText, /Synthetic Inventory Product/, `Inventory fixture did not render; visible page text: ${pageText.slice(0, 1800)}; page errors: ${pageErrors.join(" | ")}`);
  return { context, page, pageErrors };
}

async function beginAdjustment(page, direction, quantity) {
  await page.getByRole("button", { name: "Adjust Synthetic Inventory Product stock" }).click();
  await page.getByRole("heading", { name: "Adjust inventory" }).waitFor({ state: "visible" });
  await page.getByLabel("Adjustment").selectOption(direction);
  await page.getByLabel("Units").fill(String(quantity));
  await page.getByRole("button", { name: "Save adjustment" }).click();
}

describe("product inventory adjustment UI (mocked API only)", () => {
  it("posts a signed positive delta and reason, then updates stock only after success", async (t) => {
    if (!browser) return t.skip("Browser could not start.");
    let requestBody;
    let returnedStock = 20;
    let releaseResponse;
    let requestReceived;
    const received = new Promise((resolve) => { requestReceived = resolve; });
    const responseGate = new Promise((resolve) => { releaseResponse = resolve; });
    const opened = await openCatalog(t, async (route) => {
      requestBody = route.request().postDataJSON();
      requestReceived();
      await responseGate;
      returnedStock = 24;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "success", data: { newStock: 24 } }),
      });
    }, () => returnedStock);
    if (!opened) return;

    const { context, page, pageErrors } = opened;
    try {
      await beginAdjustment(page, "add", 4);
      await received;
      assert.equal(requestBody.delta, 4);
      assert.equal(requestBody.notes, "Stock received");
      assert.match(requestBody.idempotency_key, /^[0-9a-f-]{36}$/i);
      const stockCell = page.locator("tbody tr").filter({ hasText: "Synthetic Inventory Product" });
      await stockCell.getByText("20 units", { exact: true }).waitFor({ state: "visible" });
      releaseResponse();
      await stockCell.getByText("24 units", { exact: true }).waitFor({ state: "visible" });
      assert.deepEqual(pageErrors, []);
    } finally {
      releaseResponse();
      await context.close();
    }
  });

  it("posts a signed negative delta and preserves stock when the API rejects it", async (t) => {
    if (!browser) return t.skip("Browser could not start.");
    let requestBody;
    const opened = await openCatalog(t, async (route) => {
      requestBody = route.request().postDataJSON();
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ status: "error", message: "Insufficient stock for this adjustment." }),
      });
    });
    if (!opened) return;

    const { context, page, pageErrors } = opened;
    try {
      await beginAdjustment(page, "remove", 3);
      assert.equal(requestBody.delta, -3);
      assert.equal(requestBody.notes, "Stock received");
      assert.match(requestBody.idempotency_key, /^[0-9a-f-]{36}$/i);
      await page.getByText("Insufficient stock for this adjustment.", { exact: true }).waitFor({ state: "visible" });
      const stockCell = page.locator("tbody tr").filter({ hasText: "Synthetic Inventory Product" });
      await stockCell.getByText("20 units", { exact: true }).waitFor({ state: "visible" });
      assert.equal(await stockCell.getByText("17 units", { exact: true }).count(), 0);
      assert.deepEqual(pageErrors, []);
    } finally {
      await context.close();
    }
  });
});
