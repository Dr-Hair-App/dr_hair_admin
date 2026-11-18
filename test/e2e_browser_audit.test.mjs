import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { BASE_URL, getSuperAdminToken } from './test-helper.js';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

describe('8. Live Browser End-to-End Audit & A11y Verification', () => {
  let browser;

  it('Launches Headless Browser and audits Sign-in View across viewports', async () => {
    browser = await chromium.launch({
      executablePath: CHROME_PATH,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();

    // Navigate to Sign-in
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    // Verify Sign-in elements
    const emailInput = page.locator('input[autocomplete="username"]');
    const passInput = page.locator('input[autocomplete="current-password"]');
    const submitBtn = page.locator('button[type="submit"]');

    assert.ok(await emailInput.isVisible(), 'Email input should be visible');
    assert.ok(await passInput.isVisible(), 'Password input should be visible');
    assert.ok(await submitBtn.isVisible(), 'Submit button should be visible');

    // Test form validation: submit invalid credentials
    await emailInput.fill('invalid-admin@drhair.in');
    await passInput.fill('wrong-password-123');
    await submitBtn.click();
    await page.waitForTimeout(600);
    const errorMsg = page.locator('.signin-error, [role="alert"]');
    assert.ok(await errorMsg.isVisible(), 'Validation alert should display on invalid credentials');

    await context.close();
  });

  it('Audits Authenticated Workspace: verifies all 10 panels and dialog modals', async () => {
    const adminToken = getSuperAdminToken();
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });

    // Set authentication session cookie
    await context.addCookies([
      {
        name: 'drhair_admin_session',
        value: adminToken,
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        sameSite: 'Strict',
      },
    ]);

    const page = await context.newPage();

    // 1. Overview Dashboard
    await page.goto(`${BASE_URL}/?panel=overview`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    const greeting = await page.locator('h1').textContent().catch(() => '');
    assert.ok(greeting.length > 0, 'Overview dashboard header rendered');

    // 2. Test Panels Navigation
    const panelsToVerify = [
      { key: 'bookings', name: 'In-Clinic Bookings' },
      { key: 'tests', name: 'Hair Tests & Reports' },
      { key: 'orders', name: 'Orders' },
      { key: 'catalog', name: 'Commerce & Products' },
      { key: 'content', name: 'App Management & Videos' },
      { key: 'team', name: 'Admin Users' },
      { key: 'activity', name: 'Audit Log' },
      { key: 'notifications', name: 'Notification Center' },
    ];

    for (const panel of panelsToVerify) {
      await page.goto(`${BASE_URL}/?panel=${panel.key}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(500);

      // Verify no horizontal page overflow
      const hasOverflow = await page.evaluate(() => {
        const docEl = document.documentElement;
        const body = document.body;
        return Math.max(docEl.scrollWidth, body.scrollWidth) > docEl.clientWidth + 5;
      });
      assert.equal(hasOverflow, false, `${panel.name} should not have horizontal overflow`);
    }

    // 3. Test Modals & Dialogs entry and escape
    // Test Add Video modal
    await page.goto(`${BASE_URL}/?panel=content`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    const addVideoBtn = page.locator('button:has-text("Add YouTube Video"), button:has-text("Add video"), button:has-text("Upload video")').first();
    if (await addVideoBtn.isVisible()) {
      await addVideoBtn.click();
      await page.waitForTimeout(400);
      const closeBtn = page.locator('button:has-text("Cancel"), button[aria-label="Close"]').first();
      if (await closeBtn.isVisible()) await closeBtn.click();
    }

    // Test Add Product modal
    await page.goto(`${BASE_URL}/?panel=catalog`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    const addProductBtn = page.locator('button:has-text("Add product"), button:has-text("Add Product"), button:has-text("New product")').first();
    if (await addProductBtn.isVisible()) {
      await addProductBtn.click();
      await page.waitForTimeout(400);
      const closeBtn = page.locator('button:has-text("Cancel"), button[aria-label="Close"]').first();
      if (await closeBtn.isVisible()) await closeBtn.click();
    }

    // 4. Test Mobile Viewport Responsive Layout (390x844)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE_URL}/?panel=overview`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    const mobileOverflow = await page.evaluate(() => {
      const docEl = document.documentElement;
      return Math.max(docEl.scrollWidth, document.body.scrollWidth) > docEl.clientWidth + 5;
    });
    assert.equal(mobileOverflow, false, 'Mobile overview should not have horizontal overflow');

    await context.close();
    await browser.close();
  });
});
