import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BASE_URL, getSuperAdminToken, getAdminToken, getAuthHeaders } from './test-helper.js';

describe('1. Authentication Workflow (/api/auth/*)', () => {
  it('GET /api/auth/session returns 401 authenticated:false when unauthenticated', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/session`);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.authenticated, false);
  });

  it('POST /api/auth/login rejects empty or malformed payload with 400', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: '', password: '' }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.message, /Enter your admin/i);
  });

  it('POST /api/auth/login rejects invalid credentials with 401 generic error', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'dr.hair@admin', password: 'definitely-wrong-password-999' }),
    });
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.match(body.message, /Admin ID or password is incorrect/i);
  });

  it('GET /api/auth/session validates role-bearing session cookie for Super Admin', async () => {
    const token = getSuperAdminToken();
    const res = await fetch(`${BASE_URL}/api/auth/session`, {
      headers: {
        Cookie: `drhair_admin_session=${token}`,
        Accept: 'application/json',
      },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.authenticated, true);
    assert.ok(body.admin);
    assert.equal(body.admin.role, 'super_admin');
    assert.equal(body.admin.email, 'dr.hair@admin');
    assert.ok(Array.isArray(body.admin.permissions));
    assert.ok(body.admin.permissions.includes('patients.view'));
    assert.ok(body.admin.permissions.includes('bookings.manage'));
    assert.ok(body.admin.permissions.includes('orders.manage'));
  });

  it('Rejects forged or unpersisted admin accounts with 401 suspended/deactivated', async () => {
    const unpersistedToken = getAdminToken({ email: 'unpersisted@clinic.example' });
    const res = await fetch(`${BASE_URL}/api/auth/session`, {
      headers: {
        Cookie: `drhair_admin_session=${unpersistedToken}`,
        Accept: 'application/json',
      },
    });
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.authenticated, false);
  });

  it('Super Admin creates a persisted staff admin and verifies their active session', async () => {
    const superToken = getSuperAdminToken();
    const testAdminEmail = `staff.${Date.now()}@drhairindia.com`;
    
    // Create new admin account via Super Admin
    const createRes = await fetch(`${BASE_URL}/api/admin/accounts`, {
      method: 'POST',
      headers: getAuthHeaders(superToken),
      body: JSON.stringify({
        name: 'Dr. Test Staff',
        email: testAdminEmail,
        role: 'admin',
        roleTemplate: 'clinical-admin',
        permissions: ['patients.view', 'bookings.manage'],
      }),
    });
    assert.equal(createRes.status, 201);
    const createBody = await createRes.json();
    const createdAdmin = createBody.data?.admin || createBody.data;
    assert.ok(createdAdmin?.id);
    
    // Now generate token for this verified persisted admin
    const staffToken = getAdminToken({
      id: createdAdmin.id,
      email: testAdminEmail,
      role: 'admin',
    });

    const sessionRes = await fetch(`${BASE_URL}/api/auth/session`, {
      headers: {
        Cookie: `drhair_admin_session=${staffToken}`,
        Accept: 'application/json',
      },
    });
    assert.equal(sessionRes.status, 200);
    const sessionBody = await sessionRes.json();
    assert.equal(sessionBody.authenticated, true);
    assert.equal(sessionBody.admin.email, testAdminEmail);
    assert.equal(sessionBody.admin.role, 'admin');
  });

  it('POST /api/auth/logout clears the session cookie', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/logout`, {
      method: 'POST',
    });
    assert.equal(res.status, 200);
    const setCookie = res.headers.get('set-cookie');
    assert.ok(setCookie, 'Should set cookie to expire');
    assert.match(setCookie, /drhair_admin_session=/);
    assert.match(setCookie, /Max-Age=0/i);
  });
});
