import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BASE_URL, getSuperAdminToken, getAuthHeaders } from './test-helper.js';

describe('6. Content Updates & Platform Controls Workflow (/api/admin/media/*, /api/admin/features/*, /api/admin/releases/*)', () => {
  const token = getSuperAdminToken();
  const authHeaders = getAuthHeaders(token);
  let createdVideoId = null;

  it('GET /api/admin/media/videos lists video catalog', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/media/videos`, {
      headers: authHeaders,
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'success');
    assert.ok(Array.isArray(body.data?.items || body.data));
  });

  it('POST /api/admin/media/videos/youtube registers YouTube clinical video', async () => {
    const videoPayload = {
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      title: 'Dr. Hair - Understanding Telogen Effluvium & Recovery',
      category: 'Education',
      treatment: 'Clinical Hair Loss',
      placement: 'both',
      author_name: 'Dr. Jai Bansal',
      description: 'Comprehensive medical breakdown of diffuse hair shedding causes and timeline.',
    };

    const res = await fetch(`${BASE_URL}/api/admin/media/videos/youtube`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(videoPayload),
    });
    assert.ok([200, 201].includes(res.status), `Expected 200/201, got ${res.status}`);
    const body = await res.json();
    assert.equal(body.status, 'success');
    createdVideoId = body.data?.public_id || body.data?.id;
    assert.ok(createdVideoId, 'Public ID should be returned');
  });

  it('GET & PATCH /api/admin/features manages platform feature flags', async () => {
    // List features
    const listRes = await fetch(`${BASE_URL}/api/admin/features?platform=admin`, {
      headers: authHeaders,
    });
    assert.equal(listRes.status, 200);
    const listBody = await listRes.json();
    assert.equal(listBody.status, 'success');
    const items = listBody.data?.items || listBody.data || [];
    assert.ok(Array.isArray(items));

    // Update feature flag
    const patchRes = await fetch(`${BASE_URL}/api/admin/features/admin_bookings`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({
        enabled: true,
        rollout_percentage: 100,
      }),
    });
    assert.equal(patchRes.status, 200);
    const patchBody = await patchRes.json();
    assert.equal(patchBody.status, 'success');
  });

  it('GET & PUT /api/admin/releases manages app release update policies', async () => {
    // List release policies
    const listRes = await fetch(`${BASE_URL}/api/admin/releases`, {
      headers: authHeaders,
    });
    assert.equal(listRes.status, 200);
    const listBody = await listRes.json();
    assert.equal(listBody.status, 'success');

    // Update release policy for android
    const putRes = await fetch(`${BASE_URL}/api/admin/releases/android`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({
        min_version: '1.2.0',
        latest_version: '1.3.0',
        force_update: false,
        update_url: 'https://play.google.com/store/apps/details?id=com.drhair.patient',
        release_notes: 'Performance improvements and bug fixes.',
      }),
    });
    assert.equal(putRes.status, 200);
    const putBody = await putRes.json();
    assert.equal(putBody.status, 'success');
  });
});
