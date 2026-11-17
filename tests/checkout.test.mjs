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
import { normalizeCheckoutCustomer } from '../supabase/functions/_shared/customer-data.mjs';
import {
  dispatchDueOrderNotifications,
  dispatchOrderNotifications,
  orderEmailTemplate,
  providerFailure,
} from '../supabase/functions/_shared/email-notifications.mjs';
import { processMaintenanceHandler } from '../supabase/functions/_shared/process-maintenance-handler.mjs';
import { processNotificationsHandler } from '../supabase/functions/_shared/process-notifications-handler.mjs';
import { statusHandler } from '../supabase/functions/_shared/status-handler.mjs';
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
const customer = {
  full_name: 'Comprador de Prueba', email: 'buyer@example.invalid', phone: '+54 11 5555 0000',
  delivery_method: 'pickup', address_line: '', city: '', province: '', postal_code: '',
  delivery_notes: '', privacy_accepted: true,
};
const env = {
  STORE_BASE_URL: 'https://tienda-checkout-sandbox.acero-y-escamas.workers.dev',
  STORE_ALLOWED_ORIGINS: '',
  SUPABASE_URL: 'https://pacyytbscnlklyrhsshp.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role',
  MP_ACCESS_TOKEN_TEST: 'TEST-token-not-real',
  MP_WEBHOOK_SECRET_TEST: 'test-webhook-secret',
};

test('commission is applied server-side and always rounded up to $1,000', () => {
  const sandbox = { ...JSON.parse(readFileSync('supabase/test/productos-preview.json', 'utf8'))[0],
    activo: true, checkout_habilitado: true, precio_base: 100000 };
  sandbox.tonos_madera = sandbox.tonosMadera;
  sandbox.colores_metal = sandbox.coloresMetal;
  assert.equal(priceSelection(sandbox, { wood_type: 'Madera de prueba', wood_stain: 'Natural', metal_color: 'Negro', finish: 'Mate', extras: [] }, 7.5).total, 108000);
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
  assert.equal(paymentStatusFromOrder({ status: 'processed', status_detail: 'partially_refunded', transactions: { payments: [{ status: 'approved' }] } }), 'partially_refunded');
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
    if (value.endsWith('/rpc/checkout_create_order') && init.method === 'POST') return Response.json({ id: localOrderId }, { status: 200 });
    if (value.endsWith('/rpc/checkout_finalize_creation')) return new Response(null, { status: 204 });
    if (value.includes('/rest/v1/checkout_orders?id=eq.')) return new Response(null, { status: 204 });
    if (value === 'https://api.mercadopago.com/v1/orders') {
      return Response.json({ id: 'mp-order-1', status: 'created', checkout_url: 'https://www.mercadopago.com.ar/checkout/v1/redirect?id=test' }, { status: 201 });
    }
    throw new Error(`Unexpected URL ${value}`);
  };
  const request = new Request(`${env.SUPABASE_URL}/functions/v1/create-mp-order`, {
    method: 'POST',
    headers: { Origin: env.STORE_BASE_URL, 'Content-Type': 'application/json' },
    body: JSON.stringify({ product_id: product.id, client_request_id: clientRequestId, ...selection, customer, total: 1 }),
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
  assert.equal(mpCall.body.config.online.callback_url, 'https://pacyytbscnlklyrhsshp.supabase.co/functions/v1/mp-order-webhook');
  for (const key of ['success_url', 'failure_url', 'pending_url']) {
    assert.match(mpCall.body.config.online[key], /^https:\/\/tienda-checkout-sandbox\.acero-y-escamas\.workers\.dev\/pago\?/);
    assert.doesNotMatch(mpCall.body.config.online[key], /^https:\/\/tienda\.acero-y-escamas\.workers\.dev\//);
  }
  assert.equal(JSON.stringify(mpCall.body).includes('total":1'), false);
  const databaseCall = calls.find(call => call.url.endsWith('/rpc/checkout_create_order'));
  assert.equal(databaseCall.body.p_contact.email, customer.email);
  assert.equal(JSON.stringify(mpCall.body).includes(customer.email), false);
});

test('oversized and malformed requests are rejected before any provider call', async () => {
  let providerCalls = 0;
  const fetchMock = async url => {
    if (String(url).endsWith('/rpc/checkout_take_rate_slot')) return Response.json(true);
    providerCalls += 1;
    throw new Error('unexpected');
  };
  const endpoint = `${env.SUPABASE_URL}/functions/v1/create-mp-order`;
  const headers = { Origin: env.STORE_BASE_URL, 'Content-Type': 'application/json' };
  const tooLarge = await createOrderHandler(env, fetchMock)(new Request(endpoint, { method: 'POST', headers, body: 'x'.repeat(4097) }));
  assert.equal(tooLarge.status, 413);
  const malformed = await createOrderHandler(env, fetchMock)(new Request(endpoint, { method: 'POST', headers, body: '{' }));
  assert.equal(malformed.status, 400);
  assert.equal(providerCalls, 0);
});

test('an interrupted creation retries only after confirming the original purchase and idempotency key', async () => {
  const calls = [];
  const priced = priceSelection(product, selection, 7.5);
  const saved = { id: localOrderId, client_request_id: clientRequestId, product_id: product.id,
    product_snapshot: { nombre: product.nombre, sku: product.sku },
    selection_snapshot: priced.normalizedSelection, subtotal_amount: priced.subtotal,
    commission_percent: 7.5, total_amount: priced.total,
    status: 'creating', updated_at: new Date(Date.now() - 180000).toISOString() };
  const fetchMock = async (url, init = {}) => {
    const value = String(url);
    calls.push({ value, init });
    if (value.endsWith('/rpc/checkout_take_rate_slot')) return Response.json(true);
    if (value.includes('checkout_settings?')) return Response.json([{ commission_percent: 7.5, payments_enabled: true }]);
    if (value.includes('checkout_orders?client_request_id=')) return Response.json([saved]);
    if (value.includes('/productos?')) return Response.json([product]);
    if (value.includes('/checkout_order_customers?')) return Response.json([normalizeCheckoutCustomer(customer)]);
    if (value.endsWith('/v1/orders')) return Response.json({ id: 'mp-order-1', checkout_url: 'https://www.mercadopago.com.ar/checkout/test' });
    if (value.endsWith('/rpc/checkout_finalize_creation')) return new Response(null, { status: 204 });
    throw new Error(value);
  };
  const request = new Request(`${env.SUPABASE_URL}/functions/v1/create-mp-order`, {
    method: 'POST', headers: { Origin: env.STORE_BASE_URL, 'Content-Type': 'application/json' },
    body: JSON.stringify({ product_id: product.id, client_request_id: clientRequestId, ...selection, customer }),
  });
  assert.equal((await createOrderHandler(env, fetchMock)(request)).status, 201);
  const provider = calls.find(call => call.value.endsWith('/v1/orders'));
  assert.equal(provider.init.headers['X-Idempotency-Key'], clientRequestId);
  assert.equal(JSON.parse(provider.init.body).total_amount, '257000.00');
  assert.equal(calls.some(call => call.value.includes('/rest/v1/productos?')), true);
});

test('an idempotency key can only reuse the original options, price, contact and delivery data', async t => {
  const catalog = {
    ...product,
    maderas: [...product.maderas, { nombre: 'Roble', delta: 30000, activo: true }],
    extras: [...product.extras, { nombre: 'Cajón', precio: 18000, activo: true }],
  };
  const priced = priceSelection(catalog, selection, 7.5);
  const saved = {
    id: localOrderId,
    client_request_id: clientRequestId,
    product_id: catalog.id,
    product_snapshot: { nombre: catalog.nombre, sku: catalog.sku },
    selection_snapshot: priced.normalizedSelection,
    subtotal_amount: priced.subtotal,
    commission_percent: 7.5,
    total_amount: priced.total,
    status: 'created',
    mp_checkout_url: 'https://www.mercadopago.com.ar/checkout/original',
  };
  const savedCustomer = normalizeCheckoutCustomer(customer);
  const cases = [
    { name: 'madera', body: { ...selection, wood_type: 'Roble' }, currentProduct: catalog },
    { name: 'extras', body: { ...selection, extras: [] }, currentProduct: catalog },
    { name: 'precio', body: selection, currentProduct: { ...catalog, precio_base: catalog.precio_base + 1000 } },
    { name: 'contacto', body: selection, customer: { ...customer, email: 'otro@example.invalid' }, currentProduct: catalog },
    {
      name: 'entrega', body: selection, currentProduct: catalog,
      customer: { ...customer, delivery_method: 'delivery', address_line: 'Calle 123', city: 'CABA', province: 'Buenos Aires', postal_code: '1000' },
    },
  ];

  for (const testCase of cases) {
    await t.test(testCase.name, async () => {
      let providerCalls = 0;
      const fetchMock = async (url) => {
        const value = String(url);
        if (value.endsWith('/rpc/checkout_take_rate_slot')) return Response.json(true);
        if (value.includes('checkout_settings?')) return Response.json([{ commission_percent: 7.5, payments_enabled: true }]);
        if (value.includes('checkout_orders?client_request_id=')) return Response.json([saved]);
        if (value.includes('/productos?')) return Response.json([testCase.currentProduct]);
        if (value.includes('/checkout_order_customers?')) return Response.json([savedCustomer]);
        if (value === 'https://api.mercadopago.com/v1/orders') providerCalls += 1;
        throw new Error(`Unexpected URL ${value}`);
      };
      const response = await createOrderHandler(env, fetchMock)(new Request(`${env.SUPABASE_URL}/functions/v1/create-mp-order`, {
        method: 'POST',
        headers: { Origin: env.STORE_BASE_URL, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: catalog.id,
          client_request_id: clientRequestId,
          ...testCase.body,
          customer: testCase.customer || customer,
        }),
      }));
      assert.equal(response.status, 409);
      assert.equal((await response.json()).error, 'idempotency_mismatch');
      assert.equal(providerCalls, 0);
    });
  }

  await t.test('datos originales', async () => {
    const fetchMock = async url => {
      const value = String(url);
      if (value.endsWith('/rpc/checkout_take_rate_slot')) return Response.json(true);
      if (value.includes('checkout_settings?')) return Response.json([{ commission_percent: 7.5, payments_enabled: true }]);
      if (value.includes('checkout_orders?client_request_id=')) return Response.json([saved]);
      if (value.includes('/productos?')) return Response.json([catalog]);
      if (value.includes('/checkout_order_customers?')) return Response.json([savedCustomer]);
      throw new Error(`Unexpected URL ${value}`);
    };
    const response = await createOrderHandler(env, fetchMock)(new Request(`${env.SUPABASE_URL}/functions/v1/create-mp-order`, {
      method: 'POST',
      headers: { Origin: env.STORE_BASE_URL, 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: catalog.id, client_request_id: clientRequestId, ...selection, customer }),
    }));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      order_id: localOrderId,
      checkout_url: saved.mp_checkout_url,
      reused: true,
    });
  });
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
    const response = await createOrderHandler(env, fetchMock)(new Request(`${env.SUPABASE_URL}/functions/v1/create-mp-order`, {
      method: 'POST', headers: { Origin: env.STORE_BASE_URL, 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: product.id, client_request_id: requestId, ...selection, customer }),
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
    if (value.endsWith('/rpc/checkout_create_order') && init.method === 'POST') {
      inserts += 1;
      return inserts === 1 ? Response.json({ id: localOrderId }) : Response.json({ code: '23505' }, { status: 409 });
    }
    if (value.endsWith('/v1/orders')) { providerCalls += 1; return Response.json({ id: 'mp-1', checkout_url: 'https://www.mercadopago.com.ar/checkout/test' }); }
    if (value.endsWith('/rpc/checkout_finalize_creation')) return new Response(null, { status: 204 });
    throw new Error(value);
  };
  const makeRequest = () => new Request(`${env.SUPABASE_URL}/functions/v1/create-mp-order`, {
    method: 'POST', headers: { Origin: env.STORE_BASE_URL, 'Content-Type': 'application/json' },
    body: JSON.stringify({ product_id: product.id, client_request_id: clientRequestId, ...selection, customer }),
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
  const request = new Request(`${env.SUPABASE_URL}/functions/v1/mp-order-webhook?data.id=${dataId}`, {
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

test('a partially_refunded status_detail is never recorded or notified as fully accredited', async () => {
  const dataId = 'mp-order-partially-refunded';
  const requestId = 'webhook-request-partial-refund';
  const timestamp = String(Math.floor(Date.now() / 1000));
  const hash = await signature(env.MP_WEBHOOK_SECRET_TEST, signatureManifest(dataId, requestId, timestamp));
  const calls = [];
  const fetchMock = async (url, init = {}) => {
    const value = String(url);
    calls.push({ url: value, body: init.body ? JSON.parse(init.body) : null });
    if (value === `https://api.mercadopago.com/v1/orders/${dataId}`) return Response.json({
      id: dataId,
      external_reference: localOrderId,
      status: 'processed',
      status_detail: 'partially_refunded',
      total_amount: '257000.00',
      total_paid_amount: '257000.00',
      currency: 'ARS',
      transactions: { payments: [{ status: 'approved' }] },
    });
    if (value.includes('checkout_orders?id=eq.')) return Response.json([{
      id: localOrderId, total_amount: 257000, currency: 'ARS', mp_order_id: dataId,
    }]);
    if (value.endsWith('/rpc/checkout_record_verified_order')) return Response.json(true);
    throw new Error(`Unexpected URL ${value}`);
  };
  const response = await webhookHandler(env, fetchMock)(new Request(
    `${env.SUPABASE_URL}/functions/v1/mp-order-webhook?data.id=${dataId}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-request-id': requestId, 'x-signature': `ts=${timestamp},v1=${hash}` },
      body: JSON.stringify({ type: 'order', action: 'order.updated', data: { id: dataId } }),
    }
  ));
  assert.equal(response.status, 200);
  const update = calls.find(call => call.url.endsWith('/rpc/checkout_record_verified_order'));
  assert.equal(update.body.p_payment_status, 'partially_refunded');
  assert.equal(calls.some(call => call.url.endsWith('/rpc/checkout_claim_notifications')), false);
});

test('forged webhook is rejected before any provider or database request', async () => {
  let calls = 0;
  const request = new Request(`${env.SUPABASE_URL}/functions/v1/mp-order-webhook?data.id=mp-order-1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-request-id': 'request', 'x-signature': 'ts=1800000000,v1=deadbeef' },
    body: JSON.stringify({ type: 'order', data: { id: 'mp-order-1' } }),
  });
  const response = await webhookHandler(env, async () => { calls += 1; })(request);
  assert.equal(response.status, 401);
  assert.equal(calls, 0);
});

test('customer contact and delivery are minimized and validated before order creation', () => {
  assert.deepEqual(normalizeCheckoutCustomer(customer), {
    full_name: customer.full_name, email: customer.email, phone: customer.phone,
    delivery_method: 'pickup', address_line: null, city: null, province: null,
    postal_code: null, delivery_notes: null, privacy_accepted: true,
  });
  assert.throws(() => normalizeCheckoutCustomer({ ...customer, privacy_accepted: false }));
  assert.throws(() => normalizeCheckoutCustomer({ ...customer, email: 'not-an-email' }));
  assert.throws(() => normalizeCheckoutCustomer({ ...customer, delivery_method: 'delivery' }));
  assert.equal(normalizeCheckoutCustomer({
    ...customer, delivery_method: 'delivery', address_line: 'Calle 123', city: 'CABA',
    province: 'Buenos Aires', postal_code: '1000',
  }).address_line, 'Calle 123');
});

test('customer and seller emails are responsive, operational and escape every dynamic value', () => {
  const malicious = '<img src=x onerror="alert(1)">';
  const emailOrder = {
    id: localOrderId,
    product_id: product.id,
    product_snapshot: { nombre: malicious, sku: 'AYE-TEST', imagen: 'javascript:alert(1)' },
    selection_snapshot: { ...selection, extras: [malicious] },
    total_amount: 257000,
    currency: 'ARS',
    mp_order_id: 'ORD-TEST-1',
  };
  const emailCustomer = {
    ...normalizeCheckoutCustomer({
      ...customer,
      full_name: malicious,
      delivery_method: 'delivery',
      address_line: 'Calle 123', city: 'CABA', province: 'Buenos Aires', postal_code: '1000',
      delivery_notes: malicious,
    }),
  };
  const customerTemplate = orderEmailTemplate(env, { notification_type: 'customer_payment_confirmed' }, emailOrder, emailCustomer);
  const sellerTemplate = orderEmailTemplate(env, { notification_type: 'seller_payment_received' }, emailOrder, emailCustomer);
  for (const content of [customerTemplate, sellerTemplate]) {
    assert.match(content.html, /@media\(max-width:620px\)/);
    assert.match(content.html, /role="presentation"/);
    assert.match(content.html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
    assert.doesNotMatch(content.html, /<img src=x onerror=/);
    assert.doesNotMatch(content.html, /javascript:alert/);
    assert.match(content.text, /Pago acreditado|Nueva compra acreditada/);
  }
  assert.match(customerTemplate.text, /No necesitás realizar otro pago/);
  assert.match(customerTemplate.html, /max-width:560px/);
  assert.match(customerTemplate.html, /Pedido #11111111/);
  assert.match(customerTemplate.html, /<img src="https:\/\/tienda-checkout-sandbox\.acero-y-escamas\.workers\.dev\/assets\/img\/email-pangolin-708c76\.png"/);
  assert.doesNotMatch(customerTemplate.html, /class="email-image"/);
  assert.doesNotMatch(customerTemplate.html, /11111111-1111-4111-8111-111111111111/);
  assert.doesNotMatch(customerTemplate.html, /El pago y la fabricación son estados independientes/);
  assert.match(sellerTemplate.text, /buyer@example\.invalid/);
  assert.match(sellerTemplate.text, /\+54 11 5555 0000/);
  assert.match(sellerTemplate.text, /ORD-TEST-1/);
  assert.match(sellerTemplate.text, /Calle 123/);
});

test('both immediate and scheduled notification entrypoints expose the public store URL to email templates', () => {
  const webhookEntry = readFileSync(new URL('../supabase/functions/mp-order-webhook/index.ts', import.meta.url), 'utf8');
  const scheduledEntry = readFileSync(new URL('../supabase/functions/process-order-notifications/index.ts', import.meta.url), 'utf8');
  assert.match(webhookEntry, /['"]STORE_BASE_URL['"]/);
  assert.match(scheduledEntry, /['"]STORE_BASE_URL['"]/);
});

test('Resend 403 is classified as a permanent configuration rejection', () => {
  assert.deepEqual(providerFailure(403), { code: 'provider_forbidden', permanent: true });
  assert.deepEqual(providerFailure(429), { code: 'provider_rate_limited', permanent: false });
  assert.deepEqual(providerFailure(503), { code: 'provider_503', permanent: false });
});

test('public order status never exposes an unexpected backend error', async () => {
  const request = new Request(`${env.SUPABASE_URL}/functions/v1/get-mp-order-status?order_id=${localOrderId}`, {
    headers: { Origin: env.STORE_BASE_URL },
  });
  const response = await statusHandler(env, async () => { throw new Error('secret buyer@example.invalid'); })(request);
  assert.equal(response.status, 500);
  const body = await response.json();
  assert.equal(body.error, 'status_unavailable');
  assert.equal(JSON.stringify(body).includes('buyer@example.invalid'), false);
});

test('email outbox claims once and sends stable provider idempotency keys', async () => {
  const sent = [];
  let claimCount = 0;
  const notificationEnv = {
    ...env, RESEND_API_KEY: 're_test_not_real', ORDER_EMAIL_FROM: 'Sandbox <pedidos@example.invalid>',
    ORDER_NOTIFICATION_TO: 'seller@example.invalid',
  };
  const notifications = [
    { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', order_id: localOrderId, notification_type: 'customer_payment_confirmed', recipient_email: customer.email, attempt_count: 1 },
    { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', order_id: localOrderId, notification_type: 'seller_payment_received', recipient_email: null, attempt_count: 1 },
  ];
  const fetchMock = async (url, init = {}) => {
    const value = String(url);
    if (value.endsWith('/rpc/checkout_claim_notifications')) return Response.json(claimCount++ === 0 ? notifications : []);
    if (value.includes('/checkout_orders?')) return Response.json([{ id: localOrderId, product_id: product.id, product_snapshot: product, selection_snapshot: selection, total_amount: 257000, currency: 'ARS', payment_status: 'processed' }]);
    if (value.includes('/checkout_order_customers?')) return Response.json([{ full_name: customer.full_name, email: customer.email }]);
    if (value.includes('/checkout_email_outbox?') && init.method === 'PATCH') return new Response(null, { status: 204 });
    if (value === 'https://api.resend.com/emails') {
      sent.push({ headers: init.headers, body: JSON.parse(init.body) });
      return Response.json({ id: `email-${sent.length}` });
    }
    throw new Error(`Unexpected URL ${value}`);
  };
  await dispatchOrderNotifications(notificationEnv, fetchMock, localOrderId);
  await dispatchOrderNotifications(notificationEnv, fetchMock, localOrderId);
  assert.equal(sent.length, 2);
  assert.equal(new Set(sent.map(item => item.headers['Idempotency-Key'])).size, 2);
  assert.deepEqual(sent.map(item => item.body.to[0]).sort(), [customer.email, notificationEnv.ORDER_NOTIFICATION_TO].sort());
});

test('a Resend 403 becomes a safe permanent rejection without leaking provider details', async () => {
  const notificationEnv = {
    ...env, RESEND_API_KEY: 're_test_not_real', ORDER_EMAIL_FROM: 'Sandbox <pedidos@example.invalid>',
    ORDER_NOTIFICATION_TO: 'seller@example.invalid',
  };
  const notification = {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', order_id: localOrderId,
    notification_type: 'seller_payment_received', attempt_count: 1,
  };
  const patches = [];
  const fetchMock = async (url, init = {}) => {
    const value = String(url);
    if (value.endsWith('/rpc/checkout_claim_notifications')) return Response.json([notification]);
    if (value.includes('/checkout_orders?')) return Response.json([{
      id: localOrderId, product_id: product.id, product_snapshot: product,
      selection_snapshot: selection, total_amount: 257000, currency: 'ARS', mp_order_id: 'ORD-TEST', payment_status: 'processed',
    }]);
    if (value.includes('/checkout_order_customers?')) return Response.json([normalizeCheckoutCustomer(customer)]);
    if (value === 'https://api.resend.com/emails') {
      return Response.json({ message: 'sensitive provider explanation buyer@example.invalid' }, { status: 403 });
    }
    if (value.includes('/checkout_email_outbox?') && init.method === 'PATCH') {
      patches.push(JSON.parse(init.body));
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected URL ${value}`);
  };
  assert.deepEqual(await dispatchOrderNotifications(notificationEnv, fetchMock, localOrderId), {
    configured: true, processed: 0,
  });
  assert.equal(patches.length, 1);
  assert.equal(patches[0].status, 'rejected');
  assert.equal(patches[0].last_error, 'provider_forbidden');
  assert.equal(JSON.stringify(patches).includes('buyer@example.invalid'), false);
});

test('notification retry does not announce a payment refunded after the outbox claim', async () => {
  const notificationEnv = {
    ...env, RESEND_API_KEY: 're_test_not_real', ORDER_EMAIL_FROM: 'Sandbox <pedidos@example.invalid>',
  };
  const notification = {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', order_id: localOrderId,
    notification_type: 'customer_payment_confirmed', recipient_email: customer.email, attempt_count: 2,
  };
  const patches = [];
  let providerCalls = 0;
  const fetchMock = async (url, init = {}) => {
    const value = String(url);
    if (value.endsWith('/rpc/checkout_claim_notifications')) return Response.json([notification]);
    if (value.includes('/checkout_orders?')) return Response.json([{ id: localOrderId, payment_status: 'refunded' }]);
    if (value.includes('/checkout_order_customers?')) return Response.json([{ email: customer.email }]);
    if (value.includes('/checkout_email_outbox?') && init.method === 'PATCH') {
      patches.push(JSON.parse(init.body));
      return new Response(null, { status: 204 });
    }
    if (value === 'https://api.resend.com/emails') { providerCalls += 1; return Response.json({ id: 'unexpected' }); }
    throw new Error(`Unexpected URL ${value}`);
  };
  assert.deepEqual(await dispatchOrderNotifications(notificationEnv, fetchMock, localOrderId), { configured: true, processed: 0 });
  assert.equal(providerCalls, 0);
  assert.equal(patches[0].status, 'rejected');
  assert.equal(patches[0].last_error, 'payment_no_longer_accredited');
});

test('an accepted Resend email is not downgraded when persisting sent state fails', async () => {
  const notificationEnv = {
    ...env,
    RESEND_API_KEY: 're_test_not_real',
    ORDER_EMAIL_FROM: 'Sandbox <pedidos@example.invalid>',
  };
  const notification = {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    order_id: localOrderId,
    notification_type: 'customer_payment_confirmed',
    recipient_email: customer.email,
    attempt_count: 1,
  };
  const patches = [];
  const fetchMock = async (url, init = {}) => {
    const value = String(url);
    if (value.endsWith('/rpc/checkout_claim_notifications')) return Response.json([notification]);
    if (value.includes('/checkout_orders?')) return Response.json([{
      id: localOrderId, product_id: product.id, product_snapshot: product,
      selection_snapshot: selection, total_amount: 257000, currency: 'ARS', payment_status: 'processed',
    }]);
    if (value.includes('/checkout_order_customers?')) return Response.json([{ full_name: customer.full_name, email: customer.email }]);
    if (value === 'https://api.resend.com/emails') return Response.json({ id: 'resend-accepted-id' });
    if (value.includes('/checkout_email_outbox?') && init.method === 'PATCH') {
      patches.push(JSON.parse(init.body));
      return Response.json({ message: 'temporary database failure' }, { status: 503 });
    }
    throw new Error(`Unexpected URL ${value}`);
  };
  const previousConsoleError = console.error;
  console.error = () => {};
  try {
    const result = await dispatchOrderNotifications(notificationEnv, fetchMock, localOrderId);
    assert.deepEqual(result, { configured: true, processed: 0 });
  } finally {
    console.error = previousConsoleError;
  }
  assert.equal(patches.length, 1);
  assert.equal(patches[0].status, 'sent');
  assert.equal(patches.some(patch => patch.status === 'failed'), false);
});

test('scheduled notification processing expires uncertain rows before selecting retries', async () => {
  const calls = [];
  const notificationEnv = {
    ...env,
    RESEND_API_KEY: 're_test_not_real',
    ORDER_EMAIL_FROM: 'Sandbox <pedidos@example.invalid>',
  };
  const fetchMock = async url => {
    const value = String(url);
    calls.push(value);
    if (value.endsWith('/rpc/checkout_expire_uncertain_notifications')) return Response.json(1);
    if (value.endsWith('/rpc/checkout_due_notification_orders')) return Response.json([]);
    throw new Error(`Unexpected URL ${value}`);
  };
  assert.deepEqual(await dispatchDueOrderNotifications(notificationEnv, fetchMock), {
    configured: true, orders: 0, processed: 0,
  });
  assert.match(calls[0], /checkout_expire_uncertain_notifications$/);
  assert.match(calls[1], /checkout_due_notification_orders$/);
});

test('notification retry endpoint requires its independent dispatch secret', async () => {
  let calls = 0;
  const retryEnv = { ...env, ORDER_NOTIFICATION_DISPATCH_SECRET: 'synthetic-dispatch-secret' };
  const endpoint = `${env.SUPABASE_URL}/functions/v1/process-order-notifications`;
  const unauthorized = await processNotificationsHandler(retryEnv, async () => { calls += 1; })(
    new Request(endpoint, { method: 'POST', headers: { 'x-dispatch-secret': 'wrong' } })
  );
  assert.equal(unauthorized.status, 401);
  assert.equal(calls, 0);
  const authorizedWithoutEmailProvider = await processNotificationsHandler(retryEnv, async () => { calls += 1; })(
    new Request(endpoint, { method: 'POST', headers: { 'x-dispatch-secret': retryEnv.ORDER_NOTIFICATION_DISPATCH_SECRET } })
  );
  assert.equal(authorizedWithoutEmailProvider.status, 200);
  assert.deepEqual(await authorizedWithoutEmailProvider.json(), { ok: true, configured: false, orders: 0, processed: 0 });
  assert.equal(calls, 0);
});

test('personal-data maintenance requires an independent secret and calls only the purge RPC', async () => {
  let calls = 0;
  const maintenanceEnv = { ...env, ORDER_MAINTENANCE_SECRET: 'synthetic-maintenance-secret' };
  const endpoint = `${env.SUPABASE_URL}/functions/v1/process-order-maintenance`;
  const handler = processMaintenanceHandler(maintenanceEnv, async (url, init = {}) => {
    calls += 1;
    assert.match(String(url), /\/rest\/v1\/rpc\/checkout_purge_expired_customer_data$/);
    assert.equal(init.method, 'POST');
    return Response.json(3);
  });
  const unauthorized = await handler(new Request(endpoint, {
    method: 'POST', headers: { 'x-maintenance-secret': 'wrong' },
  }));
  assert.equal(unauthorized.status, 401);
  assert.equal(calls, 0);
  const authorized = await handler(new Request(endpoint, {
    method: 'POST', headers: { 'x-maintenance-secret': maintenanceEnv.ORDER_MAINTENANCE_SECRET },
  }));
  assert.equal(authorized.status, 200);
  assert.deepEqual(await authorized.json(), { ok: true, purged: 3 });
  assert.equal(calls, 1);
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

test('order management migration isolates personal data and deduplicates notifications', () => {
  const sql = readFileSync('supabase/migrations/20261114204035_order_management.sql', 'utf8');
  assert.match(sql, /alter table public\.checkout_order_customers enable row level security/i);
  assert.match(sql, /revoke all on table public\.checkout_order_customers from public, anon, authenticated/i);
  assert.match(sql, /grant select on table public\.checkout_order_customers to authenticated/i);
  assert.match(sql, /using \(\(select tienda_security\.is_admin\(\)\)\)/i);
  assert.match(sql, /grant update \(manufacturing_status, internal_notes\)/i);
  assert.match(sql, /unique \(order_id, notification_type\)/i);
  assert.match(sql, /on conflict \(order_id, notification_type\) do nothing/i);
  assert.match(sql, /for update skip locked/i);
  assert.match(sql, /checkout_due_notification_orders/i);
  assert.match(sql, /idempotency_expires_at/i);
  assert.match(sql, /interval '23 hours'/i);
  assert.match(sql, /status = 'uncertain'/i);
  assert.match(sql, /checkout_expire_uncertain_notifications/i);
  assert.match(sql, /checkout_purge_expired_customer_data/i);
  assert.doesNotMatch(sql, /grant (insert|update|delete|all).*checkout_order_customers.*authenticated/i);
});

test('admin order query is RLS-invoker paginated and permanent email failures are terminal', () => {
  const sql = readFileSync('supabase/migrations/20261115174702_improve_order_attempts_admin.sql', 'utf8');
  assert.match(sql, /security invoker/i);
  assert.match(sql, /select tienda_security\.is_admin\(\)/i);
  assert.match(sql, /limit least\(greatest\(coalesce\(p_limit, 50\), 1\), 100\)/i);
  assert.match(sql, /offset greatest\(coalesce\(p_offset, 0\), 0\)/i);
  assert.match(sql, /p_date_from is null or o\.created_at >= p_date_from/i);
  assert.match(sql, /p_date_to is null or o\.created_at < p_date_to/i);
  assert.match(sql, /'rejected'/i);
  assert.match(sql, /revoke all on function public\.checkout_admin_list_orders[\s\S]*from public, anon/i);
  assert.doesNotMatch(sql, /security definer/i);
});
