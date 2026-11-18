import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BASE_URL, getSuperAdminToken, getAuthHeaders } from './test-helper.js';

describe('2. Patient Records Workflow (/api/admin/users/*)', () => {
  const token = getSuperAdminToken();
  const authHeaders = getAuthHeaders(token);
  let sampleUserId = null;

  it('GET /api/admin/users rejects unauthenticated requests with 401', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/users`);
    assert.equal(res.status, 401);
  });

  it('GET /api/admin/users returns paginated patient directory with search & segments', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/users?page=1&limit=10`, {
      headers: authHeaders,
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'success');
    const items = body.data?.items || body.data?.users || body.data;
    assert.ok(Array.isArray(items), 'Items should be an array');
    assert.ok(items.length > 0, 'Should have initial patients');

    sampleUserId = items[0].id || items[0].user_id || items[0]._id;
    assert.ok(sampleUserId, 'Should extract a sample user id');

    // Verify patient data privacy: NO OTP or secrets in listing
    for (const patient of items) {
      assert.equal(patient.otp, undefined);
      assert.equal(patient.otp_code, undefined);
      assert.equal(patient.password_hash, undefined);
      assert.equal(patient.password, undefined);
    }
  });

  it('GET /api/admin/users/:userId fetches full patient profile, assessments, and clinical reports', async () => {
    assert.ok(sampleUserId, 'Sample user ID required');
    const res = await fetch(`${BASE_URL}/api/admin/users/${sampleUserId}`, {
      headers: authHeaders,
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'success');
    const data = body.data;
    assert.ok(data.patient, 'Should contain patient record');
    assert.ok(data.assessments !== undefined, 'Assessments field should exist');
    assert.ok(data.reports !== undefined, 'Reports field should exist');
    assert.ok(data.appointments !== undefined, 'Appointments field should exist');
    assert.ok(data.treatments !== undefined, 'Treatments field should exist');
  });

  it('Clinical Report Consent Enforcement: rejects sharing report when patient consent is unconfirmed', async () => {
    assert.ok(sampleUserId, 'Sample user ID required');
    // Attempt to set report visibility to Shared without patient consent confirmation
    const shareRes = await fetch(`${BASE_URL}/api/admin/users/${sampleUserId}/reports/sample-report-id/visibility`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({
        visibility: 'Shared',
        patient_consent_confirmed: false,
      }),
    });
    assert.equal(shareRes.status, 400);
    const shareBody = await shareRes.json();
    assert.match(shareBody.message || shareBody.error?.message, /agreed to view this report before sharing/i);
  });

  it('POST /api/admin/users/:userId/diet-plan updates clinical diet recommendations', async () => {
    assert.ok(sampleUserId, 'Sample user ID required');
    const dietPayload = {
      diet_meals: [
        {
          type: 'Breakfast',
          name: 'Boiled Eggs with Spinach & Walnuts',
          nutrients: 'High Protein (25g), Biotin, Omega-3 fatty acids',
          benefit: 'Supports keratin protein synthesis for hair follicle strength',
        },
        {
          type: 'Lunch',
          name: 'Sprouted Moong Salad with Lemon & Paneer',
          nutrients: 'Iron, Zinc, Vitamin C',
          benefit: 'Enhances scalp micro-circulation and cellular turnover',
        },
      ],
    };

    const res = await fetch(`${BASE_URL}/api/admin/users/${sampleUserId}/diet-plan`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(dietPayload),
    });
    assert.ok([200, 201].includes(res.status), `Expected 200/201, got ${res.status}`);
    const body = await res.json();
    assert.equal(body.status, 'success');
  });

  it('PATCH /api/admin/users/:userId/status suspends (blocks) and reactivates patient', async () => {
    assert.ok(sampleUserId, 'Sample user ID required');
    // Suspend patient
    const blockRes = await fetch(`${BASE_URL}/api/admin/users/${sampleUserId}/status`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({
        status: 'blocked',
        reason: 'QA security verification of account blocking safeguard.',
      }),
    });
    assert.equal(blockRes.status, 200);
    const blockBody = await blockRes.json();
    assert.equal(blockBody.status, 'success');

    // Reactivate patient
    const unblockRes = await fetch(`${BASE_URL}/api/admin/users/${sampleUserId}/status`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({
        status: 'active',
        reason: 'QA security verification unblock restore.',
      }),
    });
    assert.equal(unblockRes.status, 200);
    const unblockBody = await unblockRes.json();
    assert.equal(unblockBody.status, 'success');
  });
});
