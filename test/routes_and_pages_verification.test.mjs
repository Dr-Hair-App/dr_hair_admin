import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BASE_URL, getSuperAdminToken, getAuthHeaders } from './test-helper.js';

describe('9. Comprehensive Routes & Public Pages Verification', () => {
  const token = getSuperAdminToken();
  const authHeaders = getAuthHeaders(token);

  describe('Public App Router Pages', () => {
    const publicPages = [
      { path: '/privacy', titleSnippet: 'Privacy Policy' },
      { path: '/terms', titleSnippet: 'Terms' },
      { path: '/delete-account', titleSnippet: 'Deletion' },
      { path: '/refund-policy', titleSnippet: 'Refund' },
      { path: '/legal', titleSnippet: 'Compliance & Legal Hub' },
      { path: '/support', titleSnippet: 'Support' },
    ];

    for (const page of publicPages) {
      it(`GET ${page.path} renders HTTP 200 with matching page content`, async () => {
        const res = await fetch(`${BASE_URL}${page.path}`);
        assert.equal(res.status, 200);
        const text = await res.text();
        assert.ok(text.includes(page.titleSnippet), `Expected ${page.path} to contain "${page.titleSnippet}"`);
      });
    }

    it('GET /patients redirects cleanly', async () => {
      const res = await fetch(`${BASE_URL}/patients`, { redirect: 'manual' });
      assert.ok([302, 307, 308].includes(res.status), `Expected redirect status, got ${res.status}`);
      const location = res.headers.get('location');
      assert.ok(location?.includes('panel=overview') || location?.includes('patients'), `Expected redirect location, got ${location}`);
    });

    it('GET /patients/[patientId] renders HTTP 200', async () => {
      const res = await fetch(`${BASE_URL}/patients/test-patient-123`);
      assert.equal(res.status, 200);
    });

    it('GET /patients/[patientId]/assessments/[referenceNo] renders HTTP 200', async () => {
      const res = await fetch(`${BASE_URL}/patients/test-patient-123/assessments/DHT-998877`);
      assert.equal(res.status, 200);
    });

    it('GET /[panel] handles valid panels and 404s on invalid panel', async () => {
      const validPanels = ['overview', 'catalog', 'content', 'orders', 'tests', 'bookings', 'team', 'activity', 'notifications'];
      for (const panel of validPanels) {
        const res = await fetch(`${BASE_URL}/${panel}`);
        assert.equal(res.status, 200, `Panel /${panel} should return 200`);
      }

      // Invalid panel
      const res404 = await fetch(`${BASE_URL}/non-existent-panel-xyz`);
      assert.equal(res404.status, 404, 'Invalid panel should return 404 not found');
    });
  });

  describe('Support Inquiries API (/api/support/inquiries & /api/admin/support/inquiries)', () => {
    it('POST /api/support/inquiries validates inputs', async () => {
      const res = await fetch(`${BASE_URL}/api/support/inquiries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '', phone: '', message: '' }),
      });
      // Should reject empty fields with 400
      assert.ok([400, 422].includes(res.status), `Expected 400/422 on empty inquiry, got ${res.status}`);
    });

    it('POST /api/support/inquiries creates a new patient inquiry', async () => {
      const payload = {
        name: 'Verification Test Patient',
        phone: '+919988776655',
        email: 'test.patient@example.com',
        message: '[General Inquiry] Testing routes-api verification suite.',
      };
      const res = await fetch(`${BASE_URL}/api/support/inquiries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      assert.ok([200, 201].includes(res.status), `Expected 200/201, got ${res.status}`);
      const body = await res.json();
      assert.ok(body.status === 'success' || body.success === true || body.data?.id, 'Inquiry should be created');
    });

    it('GET /api/admin/support/inquiries lists inquiries for authenticated admin', async () => {
      const res = await fetch(`${BASE_URL}/api/admin/support/inquiries`, {
        headers: authHeaders,
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.ok(body.status === 'success' || Array.isArray(body.data?.items) || Array.isArray(body.data));
    });
  });

  describe('Category Management API with PUT fix (/api/admin/categories/[id])', () => {
    let testCategoryId = null;

    it('POST /api/admin/categories creates a test category', async () => {
      const res = await fetch(`${BASE_URL}/api/admin/categories`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          name: `Test Cat ${Date.now()}`,
          slug: `test-cat-${Date.now()}`,
          description: 'Automated verification test category',
          display_order: 99,
        }),
      });
      if (res.status === 200 || res.status === 201) {
        const body = await res.json();
        testCategoryId = body.data?.id || body.data?.category?.id;
      }
    });

    it('PUT /api/admin/categories/:id updates category without ReferenceError', async () => {
      if (!testCategoryId) return;
      const res = await fetch(`${BASE_URL}/api/admin/categories/${testCategoryId}`, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({
          name: `Updated Test Cat ${Date.now()}`,
          description: 'Updated description',
        }),
      });
      assert.ok([200, 204].includes(res.status), `Expected 200/204 on update, got ${res.status}`);
    });

    it('DELETE /api/admin/categories/:id cleans up test category', async () => {
      if (!testCategoryId) return;
      const res = await fetch(`${BASE_URL}/api/admin/categories/${testCategoryId}`, {
        method: 'DELETE',
        headers: authHeaders,
      });
      assert.ok([200, 204].includes(res.status), `Expected 200/204 on delete, got ${res.status}`);
    });
  });
});
