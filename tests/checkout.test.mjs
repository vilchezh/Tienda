import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  calculateCheckoutTotal,
  paymentStatusFromOrder,
  priceSelection,
  safeCheckoutUrl,
} from '../supabase/functions/_shared/checkout-core.mjs';
import { createOrderHandler } from '../supabase/functions/_shared/create-order-handler.mjs';
import { signatureManifest, verifyMercadoPagoSignature } from '../supabase/functions/_shared/webhook-signature.mjs';
import { webhookHandler } from '../supabase/functions/_shared/webhook-handler.mjs';

const localOrderId = '11111111-1111-4111-8111-111111111111';
const clientRequestId = '22222222-2222-4222-8222-222222222222';
const product = {
  id: 'mesa-test', nombre: 'Mesa Test', sku: 'AYE-TEST', activo: true,
  checkout_habilitado: true, precio_base: 185000,
  maderas: [{ nombre: 'Pino', delta: 12000, activo: true }],
  tonos_madera: [{ nombre: 'Natural', activo: true }],
  colores_metal: [{ nombre: 'Negro', activo: true }],
  acabados: [{ nombre: 'Mate', activo: true }],
  extras: [{ nombre: 'Ruedas', precio: 42000, activo: true }],
};
const selection = {
  wood_type: 'Pino', wood_stain: 'Natural', metal_color: 'Negro', finish: 'Mate', extras: ['Ruedas'],
};
const env = {
  STORE_BASE_URL: 'https://tienda.acero-y-escamas.workers.dev',
  STORE_ALLOWED_ORIGINS: '',
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role',
  MP_ACCESS_TOKEN_TEST: 'TEST-token-not-real',
  MP_WEBHOOK_SECRET_TEST: 'test-webhook-secret',
};

test('commission is applied server-side and always rounded up to $1,000', () => {
  assert.equal(calculateCheckoutTotal(239000, 7.5), 257000);
  assert.equal(calculateCheckoutTotal(200000, 0), 200000);
  const priced = priceSelection(product, selection, 7.5);
  assert.equal(priced.subtotal, 239000);
  assert.equal(priced.total, 257000);
  assert.deepEqual(priced.normalizedSelection.extras, ['Ruedas']);
  assert.throws(() => priceSelection(product, { ...selection, extras: ['Ruedas', 'Ruedas'] }, 7.5));
  assert.throws(() => priceSelection({ ...product, checkout_habilitado: false }, selection, 7.5));
});

test('only HTTPS Mercado Pago checkout URLs are accepted', () => {
  assert.equal(safeCheckoutUrl('https://www.mercadopago.com.ar/checkout/v1/redirect?id=1').startsWith('https://'), true);
  for (const value of ['javascript:alert(1)', 'https://mercadopago.com.ar.evil.test/x', 'http://mercadopago.com.ar/x']) {
    assert.equal(safeCheckoutUrl(value), '');
  }
});

test('refunded and charged back orders never appear accredited', () => {
  assert.equal(paymentStatusFromOrder({ status: 'refunded', transactions: { payments: [{ status: 'approved' }] } }), 'refunded');
  assert.equal(paymentStatusFromOrder({ status: 'processed', transactions: { payments: [{ status: 'charged_back' }, { status: 'approved' }] } }), 'charged_back');
  assert.equal(paymentStatusFromOrder({ status: 'partially_refunded', transactions: { payments: [{ status: 'processed' }] } }), 'partially_refunded');
  assert.equal(paymentStatusFromOrder({ status: 'action_required' }), 'action_required');
  assert.equal(paymentStatusFromOrder({ status: 'processed', transactions: { payments: [{ status: 'approved', refunded_amount: '500.00' }], refunds: [{}] } }), 'partially_refunded');
  assert.equal(paymentStatusFromOrder({ status: 'processed', transactions: { payments: [{ status: 'approved' }], chargebacks: [{}] } }), 'charged_back');
});

async function signature(secret, manifest) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = await crypto.subtle.sign('HMAC', key, encoder.encode(manifest));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

test('Order webhook signature validates the official manifest and rejects tampering/replay', async () => {
  const timestamp = '1800000000';
  const requestId = 'request-123';
  const dataId = 'mp-order-123';
  const hash = await signature(env.MP_WEBHOOK_SECRET_TEST, signatureManifest(dataId, requestId, timestamp));
  const input = { signature: `ts=${timestamp},v1=${hash}`, requestId, dataId, secret: env.MP_WEBHOOK_SECRET_TEST, now: 1800000000000 };
  assert.equal(await verifyMercadoPagoSignature(input), true);
  assert.equal(await verifyMercadoPagoSignature({ ...input, dataId: 'tampered' }), false);
  assert.equal(await verifyMercadoPagoSignature({ ...input, now: 1800000601000 }), false);
  const millis = '1800000000123';
  const millHash = await signature(env.MP_WEBHOOK_SECRET_TEST, signatureManifest('ORD01JTESTABC', requestId, millis));
  const notification = { signature: `ts=${millis},v1=${millHash}`, requestId, dataId: 'ORD01JTESTABC', secret: env.MP_WEBHOOK_SECRET_TEST, now: 1800000000123 };
  assert.equal(await verifyMercadoPagoSignature(notification), true);
  assert.equal(await verifyMercadoPagoSignature({ ...notification, now: 1800000301124 }), false);
  assert.equal(await verifyMercadoPagoSignature({ ...notification, signature: `ts=1800000000,v1=${millHash}` }), false);
});

test('Order webhook signature normalizes alphanumeric resource ids', () => {
  assert.equal(
    signatureManifest('ORD01JTESTABC', 'request-1', '1800000000'),
    'id:ord01jtestabc;request-id:request-1;ts:1800000000;'
  );
});

test('create function recalculates catalog prices and sends POST /v1/orders with config.online returns', async () => {
  const calls = [];
  const fetchMock = async (url, init = {}) => {
    calls.push({ url: String(url), init, body: init.body ? JSON.parse(init.body) : null });
    const value = String(url);
    if (value.endsWith('/rpc/checkout_take_rate_slot')) return Response.json(true);
    if (value.includes('checkout_orders?client_request_id=')) return Response.json([]);
    if (value.includes('productos?')) return Response.json([product]);
    if (value.includes('checkout_settings?')) return Response.json([{ commission_percent: 7.5, payments_enabled: true }]);
    if (value.endsWith('/rest/v1/checkout_orders') && init.method === 'POST') return Response.json([{ id: localOrderId }], { status: 201 });
    if (value.endsWith('/rpc/checkout_finalize_creation')) return new Response(null, { status: 204 });
    if (value.includes('/rest/v1/checkout_orders?id=eq.')) return new Response(null, { status: 204 });
    if (value === 'https://api.mercadopago.com/v1/orders') {
      return Response.json({ id: 'mp-order-1', status: 'created', checkout_url: 'https://www.mercadopago.com.ar/checkout/v1/redirect?id=test' }, { status: 201 });
    }
    throw new Error(`Unexpected URL ${value}`);
  };
  const request = new Request('https://project.supabase.co/functions/v1/create-mp-order', {
    method: 'POST',
    headers: { Origin: env.STORE_BASE_URL, 'Content-Type': 'application/json' },
    body: JSON.stringify({ product_id: product.id, client_request_id: clientRequestId, ...selection, total: 1 }),
  });
  const response = await createOrderHandler(env, fetchMock)(request);
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.equal(result.amount, 257000);
  const mpCall = calls.find(call => call.url === 'https://api.mercadopago.com/v1/orders');
  assert.equal(mpCall.init.method, 'POST');
  assert.equal(mpCall.init.headers['X-Idempotency-Key'], clientRequestId);
  assert.equal(mpCall.body.processing_mode, 'manual');
  assert.equal(mpCall.body.total_amount, '257000.00');
  assert.equal(mpCall.body.items[0].unit_price, '257000.00');
  assert.equal(mpCall.body.config.online.success_url, `${env.STORE_BASE_URL}/pago?pedido=${localOrderId}&resultado=exito`);
  assert.equal(mpCall.body.config.online.failure_url, `${env.STORE_BASE_URL}/pago?pedido=${localOrderId}&resultado=fallo`);
  assert.equal(mpCall.body.config.online.pending_url, `${env.STORE_BASE_URL}/pago?pedido=${localOrderId}&resultado=pendiente`);
  assert.match(mpCall.body.config.online.callback_url, /mp-order-webhook$/);
  assert.equal(JSON.stringify(mpCall.body).includes('total":1'), false);
});

test('oversized and malformed requests are rejected before any provider call', async () => {
  let providerCalls = 0;
  const fetchMock = async url => {
    if (String(url).endsWith('/rpc/checkout_take_rate_slot')) return Response.json(true);
    providerCalls += 1;
    throw new Error('unexpected');
  };
  const endpoint = 'https://project.supabase.co/functions/v1/create-mp-order';
  const headers = { Origin: env.STORE_BASE_URL, 'Content-Type': 'application/json' };
  const tooLarge = await createOrderHandler(env, fetchMock)(new Request(endpoint, { method: 'POST', headers, body: 'x'.repeat(4097) }));
  assert.equal(tooLarge.status, 413);
  const malformed = await createOrderHandler(env, fetchMock)(new Request(endpoint, { method: 'POST', headers, body: '{' }));
  assert.equal(malformed.status, 400);
  assert.equal(providerCalls, 0);
});

test('an interrupted creation retries with the stored amount and original idempotency key', async () => {
  const calls = [];
  const saved = { id: localOrderId, client_request_id: clientRequestId, product_id: product.id,
    product_snapshot: { nombre: product.nombre, sku: product.sku }, total_amount: 257000,
    status: 'creating', updated_at: new Date(Date.now() - 180000).toISOString() };
  const fetchMock = async (url, init = {}) => {
    const value = String(url);
    calls.push({ value, init });
    if (value.endsWith('/rpc/checkout_take_rate_slot')) return Response.json(true);
    if (value.includes('checkout_settings?')) return Response.json([{ commission_percent: 0, payments_enabled: true }]);
    if (value.includes('checkout_orders?client_request_id=')) return Response.json([saved]);
    if (value.endsWith('/v1/orders')) return Response.json({ id: 'mp-order-1', checkout_url: 'https://www.mercadopago.com.ar/checkout/test' });
    if (value.endsWith('/rpc/checkout_finalize_creation')) return new Response(null, { status: 204 });
    throw new Error(value);
  };
  const request = new Request('https://project.supabase.co/functions/v1/create-mp-order', {
    method: 'POST', headers: { Origin: env.STORE_BASE_URL, 'Content-Type': 'application/json' },
    body: JSON.stringify({ product_id: product.id, client_request_id: clientRequestId }),
  });
  assert.equal((await createOrderHandler(env, fetchMock)(request)).status, 201);
  const provider = calls.find(call => call.value.endsWith('/v1/orders'));
  assert.equal(provider.init.headers['X-Idempotency-Key'], clientRequestId);
  assert.equal(JSON.parse(provider.init.body).total_amount, '257000.00');
  assert.equal(calls.some(call => call.value.includes('/rest/v1/productos?')), false);
});

test('global switch blocks both new checkout and recovery without touching confirmed orders', async () => {
  const calls = [];
  const fetchMock = async url => {
    const value = String(url);
    calls.push(value);
    if (value.endsWith('/rpc/checkout_take_rate_slot')) return Response.json(true);
    if (value.includes('checkout_settings?')) return Response.json([{ commission_percent: 0, payments_enabled: false }]);
    throw new Error(`unexpected request: ${value}`);
  };
  for (const requestId of [clientRequestId, '33333333-3333-4333-8333-333333333333']) {
    const response = await createOrderHandler(env, fetchMock)(new Request('https://project.supabase.co/functions/v1/create-mp-order', {
      method: 'POST', headers: { Origin: env.STORE_BASE_URL, 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: product.id, client_request_id: requestId, ...selection }),
    }));
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, 'checkout_disabled');
  }
  assert.equal(calls.some(value => value.includes('checkout_orders') || value.endsWith('/v1/orders')), false);
});

test('simultaneous creation attempts with one idempotency key do not both call Mercado Pago', async () => {
  let providerCalls = 0;
  let inserts = 0;
  const fetchMock = async (url, init = {}) => {
    const value = String(url);
    if (value.endsWith('/rpc/checkout_take_rate_slot')) return Response.json(true);
    if (value.includes('checkout_orders?client_request_id=')) return Response.json([]);
    if (value.includes('productos?')) return Response.json([product]);
    if (value.includes('checkout_settings?')) return Response.json([{ commission_percent: 0, payments_enabled: true }]);
    if (value.endsWith('/rest/v1/checkout_orders') && init.method === 'POST') {
      inserts += 1;
      return inserts === 1 ? Response.json([{ id: localOrderId }], { status: 201 }) : Response.json({ code: '23505' }, { status: 409 });
    }
    if (value.endsWith('/v1/orders')) { providerCalls += 1; return Response.json({ id: 'mp-1', checkout_url: 'https://www.mercadopago.com.ar/checkout/test' }); }
    if (value.endsWith('/rpc/checkout_finalize_creation')) return new Response(null, { status: 204 });
    throw new Error(value);
  };
  const makeRequest = () => new Request('https://project.supabase.co/functions/v1/create-mp-order', {
    method: 'POST', headers: { Origin: env.STORE_BASE_URL, 'Content-Type': 'application/json' },
    body: JSON.stringify({ product_id: product.id, client_request_id: clientRequestId, ...selection }),
  });
  const responses = await Promise.all([createOrderHandler(env, fetchMock)(makeRequest()), createOrderHandler(env, fetchMock)(makeRequest())]);
  assert.deepEqual(responses.map(r => r.status).sort(), [201, 409]);
  assert.equal(providerCalls, 1);
});

test('signed Order webhook fetches real state from Mercado Pago before updating the local order', async () => {
  const dataId = 'mp-order-1';
  const requestId = 'webhook-request-1';
  const timestamp = String(Math.floor(Date.now() / 1000));
  const hash = await signature(env.MP_WEBHOOK_SECRET_TEST, signatureManifest(dataId, requestId, timestamp));
  const calls = [];
  const fetchMock = async (url, init = {}) => {
    calls.push({ url: String(url), init, body: init.body ? JSON.parse(init.body) : null });
    const value = String(url);
    if (value === `https://api.mercadopago.com/v1/orders/${dataId}`) return Response.json({
      id: dataId, external_reference: localOrderId, status: 'processed', status_detail: 'accredited',
      total_amount: '257000.00', total_paid_amount: '257000.00', currency: 'ARS',
      transactions: { payments: [{ status: 'approved' }] },
    });
    if (value.includes('checkout_orders?id=eq.') && init.method !== 'PATCH') return Response.json([{ id: localOrderId, total_amount: 257000, currency: 'ARS', mp_order_id: dataId }]);
    if (value.endsWith('/rpc/checkout_record_verified_order')) return Response.json(true);
    throw new Error(`Unexpected URL ${value}`);
  };
  const request = new Request(`https://project.supabase.co/functions/v1/mp-order-webhook?data.id=${dataId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-request-id': requestId, 'x-signature': `ts=${timestamp},v1=${hash}` },
    body: JSON.stringify({ type: 'order', action: 'order.updated', data: { id: dataId } }),
  });
  const response = await webhookHandler(env, fetchMock)(request);
  assert.equal(response.status, 200);
  assert.equal(calls.some(call => call.url === `https://api.mercadopago.com/v1/orders/${dataId}`), true);
  const update = calls.find(call => call.url.endsWith('/rpc/checkout_record_verified_order'));
  assert.equal(update.body.p_status, 'processed');
  assert.equal(update.body.p_payment_status, 'processed');
  assert.equal(paymentStatusFromOrder({ status: 'processed', transactions: { payments: [{ status: 'approved' }] } }), 'processed');
});

test('forged webhook is rejected before any provider or database request', async () => {
  let calls = 0;
  const request = new Request('https://project.supabase.co/functions/v1/mp-order-webhook?data.id=mp-order-1', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-request-id': 'request', 'x-signature': 'ts=1800000000,v1=deadbeef' },
    body: JSON.stringify({ type: 'order', data: { id: 'mp-order-1' } }),
  });
  const response = await webhookHandler(env, async () => { calls += 1; })(request);
  assert.equal(response.status, 401);
  assert.equal(calls, 0);
});

test('migration keeps test mode fail-closed and protects payment tables with RLS', () => {
  const sql = readFileSync('supabase/migrations/20261114040000_checkout_pro_orders.sql', 'utf8');
  assert.match(sql, /checkout_habilitado boolean not null default false/i);
  assert.match(sql, /payments_enabled boolean not null default false/i);
  assert.match(sql, /total_amount % 1000 = 0/i);
  assert.match(sql, /alter table public\.checkout_orders enable row level security/i);
  assert.match(sql, /tienda_security\.is_admin\(\)/i);
  assert.match(sql, /for update/i);
  assert.match(sql, /on conflict \(request_id\) do nothing/i);
  assert.match(sql, /checkout_take_rate_slot/i);
  assert.match(sql, /alter table public\.checkout_rate_windows enable row level security/i);
  assert.match(sql, /revoke all on public\.checkout_rate_windows from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.checkout_take_rate_slot\(\) to service_role/i);
});
