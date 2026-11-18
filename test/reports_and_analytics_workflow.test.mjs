import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BASE_URL, getSuperAdminToken, getAuthHeaders } from './test-helper.js';

describe('7. Reports & Analytics Workflow (/api/admin/dashboard/summary, /api/admin/commerce/sales-report, /api/admin/audit-logs, /api/admin/exports/*)', () => {
  const token = getSuperAdminToken();
  const authHeaders = getAuthHeaders(token);

  it('GET /api/admin/dashboard/summary aggregates key operational metrics', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/dashboard/summary`, {
      headers: authHeaders,
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'success');
    const data = body.data;
    assert.ok(data);
    assert.ok(data.patients !== undefined, 'Should have patient metrics');
    assert.ok(data.appointments !== undefined, 'Should have appointment metrics');
  });

  it('GET /api/admin/commerce/sales-report aggregates revenue and payment stats', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/commerce/sales-report`, {
      headers: authHeaders,
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'success');
    assert.ok(body.data);
  });

  it('GET /api/admin/payments lists received financials across clinic and commerce', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/payments`, {
      headers: authHeaders,
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'success');
    assert.ok(body.data);
  });

  it('GET /api/admin/audit-logs searches audit trail with redaction', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/audit-logs?limit=20`, {
      headers: authHeaders,
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'success');
    const items = body.data?.items || body.data || [];
    assert.ok(Array.isArray(items));
  });

  it('GET /api/admin/exports/patients exports patient records omitting credentials', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/exports/patients`, {
      headers: authHeaders,
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'success');
    const items = body.data?.items || body.data || [];
    assert.ok(Array.isArray(items));
    for (const item of items) {
      assert.equal(item.password_hash, undefined);
      assert.equal(item.otp, undefined);
      assert.equal(item.otp_code, undefined);
    }
  });

  it('GET /api/admin/exports/appointments exports clinic appointments', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/exports/appointments`, {
      headers: authHeaders,
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'success');
    assert.ok(body.data);
  });
});
