import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chromium } from "playwright";

const BASE_URL = process.env.ADMIN_TEST_BASE_URL || "http://localhost:3001";
const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

describe("product editor publish flow", () => {
  it("shows parcel validation at Pricing, then publishes once and closes after success", async (t) => {
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

    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const pageErrors = [];
    const productWrites = [];
    let savedProduct;
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      let status = 200;
      let body = { status: "success", data: {} };

      if (url.pathname === "/api/auth/session") {
        body = {
          authenticated: true,
          admin: { email: "qa@example.test", name: "QA", role: "super_admin", permissions: [] },
        };
      } else if (url.pathname === "/api/admin/features") {
        body = { status: "success", data: { items: [{ key: "admin_catalog", enabled: true }] } };
      } else if (url.pathname === "/api/admin/products" && request.method() === "GET") {
        body = { status: "success", data: { items: savedProduct ? [savedProduct] : [] } };
      } else if (url.pathname === "/api/admin/coupons") {
        body = { status: "success", data: { items: [], coupons: [] } };
      } else if (url.pathname === "/api/admin/products" && request.method() === "POST") {
        productWrites.push(request);
        const postData = request.postData() || "";
        assert.match(request.headers()["content-type"] || "", /^multipart\/form-data; boundary=/);
        assert.match(postData, /name="product"/);
        assert.match(postData, /Synthetic QA Product/);
        status = 201;
        savedProduct = {
          id: "qa-published-product",
          name: "Synthetic QA Product",
          category: "Scalp Serum",
          sku: "QA-SERUM-01",
          price: 499,
          status: "Active",
          stock: 0,
          unitsSold: 0,
          revenue: 0,
          media: [],
          images: [],
          rootCauses: ["DHT Sensitivity"],
          supplyPlans: [],
        };
        body = {
          status: "success",
          data: { product: savedProduct },
        };
      }

      await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    });

    try {
      try {
        await page.goto(`${BASE_URL}/catalog`, { waitUntil: "domcontentloaded" });
      } catch (error) {
        if (error.message.includes("ERR_CONNECTION_REFUSED")) {
          t.skip(`Local Admin server is unavailable at ${BASE_URL}`);
          return;
        }
        throw error;
      }

      await page.getByRole("tab", { name: /Products/ }).click();
      await page.getByRole("button", { name: /Add product/ }).first().click();
      await page.getByLabel("Product / Medicine name").fill("Synthetic QA Product");
      await page.getByLabel("Shop category").fill("Scalp Serum");
      await page.getByRole("button", { name: "DHT Sensitivity", exact: true }).click();
      await page.getByRole("button", { name: /Continue to Pricing/ }).click();
      await page.getByLabel("Selling price (₹)").fill("499");
      await page.getByRole("button", { name: /Continue to Media/ }).click();
      await page.getByRole("button", { name: /Continue to Clinical/ }).click();

      await page.getByRole("button", { name: "Publish product to catalog" }).click();
      await page.getByRole("alert").getByText(/Complete the packed parcel weight/).waitFor({ state: "visible" });
      assert.equal(await page.getByRole("tab", { name: /Pricing/ }).getAttribute("aria-selected"), "true");
      assert.equal(productWrites.length, 0, "Invalid parcel measurements must not send a product request.");

      await page.getByRole("button", { name: /Serum \/ Dropper Bottle/ }).click();
      await page.getByRole("button", { name: /Continue to Media/ }).click();
      await page.getByRole("button", { name: /Continue to Clinical/ }).click();
      await page.getByRole("button", { name: "Publish product to catalog" }).click();

      await page.getByRole("heading", { name: "Add Medicine / Product" }).waitFor({ state: "hidden" });
      assert.equal(productWrites.length, 1, "Publish should issue one create request.");
      await page.getByText("Synthetic QA Product", { exact: true }).first().waitFor({ state: "visible" });
      assert.deepEqual(pageErrors, []);
    } finally {
      await browser.close();
    }
  });
});
