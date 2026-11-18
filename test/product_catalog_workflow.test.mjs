import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BASE_URL, getSuperAdminToken, getAuthHeaders } from './test-helper.js';

describe('5. Product Catalog & Promotions Workflow (/api/admin/products/*, /api/admin/coupons/*)', () => {
  const token = getSuperAdminToken();
  const authHeaders = getAuthHeaders(token);
  let createdProductId = null;
  let createdCouponId = null;

  it('GET /api/admin/products lists existing products', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/products?limit=50&status=all`, {
      headers: authHeaders,
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'success');
    const items = body.data?.items || body.data;
    assert.ok(Array.isArray(items), 'Items should be an array');
  });

  it('POST /api/admin/products creates a new clinical hair care product', async () => {
    const uniqueSku = `DRH-TEST-${Date.now().toString().slice(-4)}`;
    const productPayload = {
      name: 'Anti-Hairfall Biotin Peptide Serum',
      subtitle: 'Clinical strength scalp revitalizing serum',
      sku: uniqueSku,
      category: 'Hair Serum',
      price: 1299,
      compare_at_price: 1599,
      cost_price: 450,
      stock: 50,
      low_stock_threshold: 10,
      supply_plans: [
        {
          id: 'plan_1',
          title: 'Single Pack (60ml)',
          price: 1299,
          compareAtPrice: 1599,
          mrp: 1599,
          shipping_profile: {
            weight_kg: 0.25,
            length_cm: 15,
            breadth_cm: 10,
            height_cm: 5,
          },
        },
      ],
      root_causes: ['DHT Sensitivity', 'Nutritional Deficiency', 'Scalp Inflammation'],
      status: 'active',
      description: 'Formulated with Redensyl, Procapil, and Anagain for optimal hair density.',
      benefits: [
        { title: 'Follicle Stimulation', description: 'Reactivates dormant hair stem cells.' },
        { title: 'DHT Defense', description: 'Inhibits 5-alpha reductase enzyme at root.' },
      ],
      ingredients: [
        { name: 'Redensyl 3%', concentration: '3%', purpose: 'Stem cell activation' },
        { name: 'Biotinoyl Tripeptide-1', concentration: '2%', purpose: 'Root anchoring' },
      ],
    };

    const res = await fetch(`${BASE_URL}/api/admin/products`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(productPayload),
    });
    assert.ok([200, 201].includes(res.status), `Expected 200/201, got ${res.status}`);
    const body = await res.json();
    assert.equal(body.status, 'success');
    createdProductId = body.data?.id || body.data?.productId;
    assert.ok(createdProductId, 'Product ID should be returned');
  });

  it('GET & PATCH /api/admin/products/:id updates price and stock level', async () => {
    assert.ok(createdProductId, 'Created product ID required');

    // Get single product
    const getRes = await fetch(`${BASE_URL}/api/admin/products/${createdProductId}`, {
      headers: authHeaders,
    });
    assert.equal(getRes.status, 200);

    // Update product
    const patchRes = await fetch(`${BASE_URL}/api/admin/products/${createdProductId}`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({
        price: 1199,
        stock: 75,
      }),
    });
    assert.equal(patchRes.status, 200);
    const patchBody = await patchRes.json();
    assert.equal(patchBody.status, 'success');
  });

  it('GET /api/admin/categories fetches category taxonomy', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/categories`, {
      headers: authHeaders,
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'success');
    const categories = body.data?.products || body.data?.items || body.data;
    assert.ok(Array.isArray(categories) || (body.data && typeof body.data === 'object'));
  });

  it('POST & GET /api/admin/coupons creates and verifies promo coupon', async () => {
    const couponCode = `DRH${Date.now().toString().slice(-4)}`;
    const couponPayload = {
      code: couponCode,
      type: 'percentage',
      discount_value: 20,
      max_discount_amount: 300,
      min_order_value: 999,
      usage_limit: 100,
      expires_at: '2026-12-31T23:59:59.000Z',
      active: true,
    };

    // Create coupon
    const createRes = await fetch(`${BASE_URL}/api/admin/coupons`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(couponPayload),
    });
    assert.ok([200, 201].includes(createRes.status), `Expected 200/201, got ${createRes.status}`);
    const createBody = await createRes.json();
    assert.equal(createBody.status, 'success');
    createdCouponId = createBody.data?.id || createBody.data?.coupon?.id;
    assert.ok(createdCouponId, 'Created coupon must have an ID');

    // List coupons - verify response structure harmonized by Backend Developer (#11)
    const listRes = await fetch(`${BASE_URL}/api/admin/coupons`, {
      headers: authHeaders,
    });
    assert.equal(listRes.status, 200);
    const listBody = await listRes.json();
    assert.equal(listBody.status, 'success');
    // Verify coupons array exists directly on body.data.coupons or body.data
    const couponsList = listBody.data?.coupons || listBody.data?.items || listBody.data || [];
    assert.ok(Array.isArray(couponsList), 'Coupons list must be an array');
    const found = couponsList.find((c) => c.code === couponCode);
    assert.ok(found, 'Created coupon should be found in coupons list');
  });

  it('POST /api/admin/products validates required fields (rejects empty name / invalid pricing)', async () => {
    // Missing name
    const resNoName = await fetch(`${BASE_URL}/api/admin/products`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ category: 'Hair Oil', price: 499 }),
    });
    assert.equal(resNoName.status, 400);

    // Negative / zero price
    const resBadPrice = await fetch(`${BASE_URL}/api/admin/products`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ name: 'Test Oil', category: 'Hair Oil', price: 0 }),
    });
    assert.equal(resBadPrice.status, 400);

    // Missing supply plan shipping profile
    const resNoShipping = await fetch(`${BASE_URL}/api/admin/products`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: 'Test Oil',
        category: 'Hair Oil',
        price: 499,
        supply_plans: [{ id: 'p1', title: 'Single', price: 499, mrp: 599 }],
      }),
    });
    assert.equal(resNoShipping.status, 400);
  });
});
