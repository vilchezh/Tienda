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
    if (value.includes('checkout_orders?client_request_id=')) return Response.json([]);
    if (value.includes('productos?')) return Response.json([product]);
    if (value.includes('checkout_settings?')) return Response.json([{ commission_percent: 7.5, payments_enabled: true }]);
    if (value.endsWith('/rest/v1/checkout_orders') && init.method === 'POST') return Response.json([{ id: localOrderId }], { status: 201 });
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

test('signed Order webhook fetches real state from Mercado Pago before updating the local order', async () => {
  const dataId = 'mp-order-1';
  const requestId = 'webhook-request-1';
  const timestamp = String(Math.floor(Date.now() / 1000));
  const hash = await signature(env.MP_WEBHOOK_SECRET_TEST, signatureManifest(dataId, requestId, timestamp));
  const calls = [];
  const fetchMock = async (url, init = {}) => {
    calls.push({ url: String(url), init, body: init.body ? JSON.parse(init.body) : null });
    const value = String(url);
    if (value.includes('mp_webhook_events?')) return Response.json([]);
    if (value === `https://api.mercadopago.com/v1/orders/${dataId}`) return Response.json({
      id: dataId, external_reference: localOrderId, status: 'processed', status_detail: 'accredited',
      total_amount: '257000.00', total_paid_amount: '257000.00', currency: 'ARS',
      transactions: { payments: [{ status: 'approved' }] },
    });
    if (value.includes('checkout_orders?id=eq.') && init.method !== 'PATCH') return Response.json([{ id: localOrderId, total_amount: 257000, currency: 'ARS', mp_order_id: dataId }]);
    if (value.includes('checkout_orders?id=eq.') && init.method === 'PATCH') return new Response(null, { status: 204 });
    if (value.endsWith('/rest/v1/mp_webhook_events')) return Response.json([], { status: 201 });
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
  const update = calls.find(call => call.init.method === 'PATCH');
  assert.equal(update.body.status, 'processed');
  assert.equal(update.body.payment_status, 'approved');
  assert.equal(paymentStatusFromOrder({ transactions: { payments: [{ status: 'approved' }] } }), 'approved');
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
});
