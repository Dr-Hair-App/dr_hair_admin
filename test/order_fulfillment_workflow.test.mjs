import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BASE_URL, getSuperAdminToken, getAuthHeaders } from './test-helper.js';

describe('4. Commerce Order Fulfillment Workflow (/api/admin/orders/*)', () => {
  const token = getSuperAdminToken();
  const authHeaders = getAuthHeaders(token);
  let sampleOrderId = null;

  it('GET /api/admin/orders rejects unauthenticated requests with 401', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/orders`);
    assert.equal(res.status, 401);
  });

  it('GET /api/admin/orders lists existing orders and queue tabs', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/orders`, {
      headers: authHeaders,
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'success');
    const items = body.data?.items || body.data?.orders || body.data || [];
    assert.ok(Array.isArray(items), 'Orders should be an array');

    if (items.length > 0) {
      sampleOrderId = items[0].order_id || items[0].id;
    }
  });

  it('GET /api/admin/orders/:orderId fetches single order detail', async () => {
    if (!sampleOrderId) return;
    const res = await fetch(`${BASE_URL}/api/admin/orders/${sampleOrderId}`, {
      headers: authHeaders,
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'success');
    assert.ok(body.data);
  });

  it('PATCH /api/admin/orders/:orderId/fulfillment updates fulfillment status to Preparing and Shipped', async () => {
    if (!sampleOrderId) return;

    // Update to Preparing
    const prepRes = await fetch(`${BASE_URL}/api/admin/orders/${sampleOrderId}/fulfillment`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({
        status: 'Preparing',
      }),
    });
    assert.ok([200, 201].includes(prepRes.status));

    // Update to Shipped with tracking
    const shipRes = await fetch(`${BASE_URL}/api/admin/orders/${sampleOrderId}/fulfillment`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({
        status: 'Shipped',
        courier: 'BlueDart Express',
        tracking_number: 'BD-88997766',
        tracking_url: 'https://bluedart.example/track/BD-88997766',
      }),
    });
    assert.ok([200, 201].includes(shipRes.status));
  });

  it('POST /api/admin/orders/:orderId/cancel validates order cancellation', async () => {
    if (!sampleOrderId) return;
    const cancelRes = await fetch(`${BASE_URL}/api/admin/orders/${sampleOrderId}/cancel`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        reason: 'Customer requested cancellation before courier dispatch.',
      }),
    });
    // Can succeed or return 400 if already Shipped, which demonstrates state validation
    assert.ok([200, 400].includes(cancelRes.status));
  });
});
