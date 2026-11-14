import {
  CheckoutError,
  normalizeBaseUrl,
  priceSelection,
  safeCheckoutUrl,
} from './checkout-core.mjs';
import { corsHeaders } from './cors.mjs';
import { encodeFilter, firstRow, supabaseRequest } from './supabase-rest.mjs';

const MERCADO_PAGO_API = 'https://api.mercadopago.com';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body, status, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

function publicError(error, headers) {
  if (error instanceof CheckoutError) {
    return json({ error: error.code, message: error.message }, error.status, headers);
  }
  console.error('create-mp-order failed', error instanceof Error ? error.message : 'unknown');
  return json({ error: 'checkout_unavailable', message: 'No pudimos iniciar el pago. Intentá nuevamente.' }, 500, headers);
}

async function mercadoPagoRequest(env, fetchFn, path, init = {}) {
  const token = env.MP_ACCESS_TOKEN_TEST;
  if (!token) throw new CheckoutError('Falta MP_ACCESS_TOKEN_TEST.', 503, 'checkout_not_configured');
  const response = await fetchFn(`${MERCADO_PAGO_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error('Mercado Pago rejected order', response.status, body?.code || body?.message || 'unknown');
    throw new CheckoutError('Mercado Pago no pudo crear la orden de prueba.', 502, 'provider_error');
  }
  return body;
}

async function findExisting(env, fetchFn, clientRequestId) {
  return firstRow(
    env,
    fetchFn,
    `checkout_orders?client_request_id=eq.${encodeFilter(clientRequestId)}&select=id,status,mp_checkout_url&limit=1`
  );
}

function returnUrls(baseUrl, orderId) {
  const query = `pedido=${encodeURIComponent(orderId)}`;
  return {
    success_url: `${baseUrl}/pago?${query}&resultado=exito`,
    failure_url: `${baseUrl}/pago?${query}&resultado=fallo`,
    pending_url: `${baseUrl}/pago?${query}&resultado=pendiente`,
  };
}

export function createOrderHandler(env, fetchFn = fetch) {
  return async request => {
    let cors;
    try { cors = corsHeaders(request, env); }
    catch (error) { return publicError(error, {}); }
    if (!cors) return json({ error: 'origin_not_allowed' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors);

    try {
      const body = await request.json().catch(() => null);
      const productId = typeof body?.product_id === 'string' ? body.product_id.trim() : '';
      const clientRequestId = typeof body?.client_request_id === 'string' ? body.client_request_id : '';
      if (!productId || productId.length > 120 || !UUID_PATTERN.test(clientRequestId)) {
        throw new CheckoutError('La solicitud de compra no es válida.', 400, 'invalid_request');
      }
      if (body?.custom_notes) {
        throw new CheckoutError('Los pedidos personalizados se coordinan por WhatsApp.', 409, 'custom_order');
      }

      const existing = await findExisting(env, fetchFn, clientRequestId);
      if (existing?.mp_checkout_url) {
        const checkoutUrl = safeCheckoutUrl(existing.mp_checkout_url);
        if (checkoutUrl) return json({ order_id: existing.id, checkout_url: checkoutUrl, reused: true }, 200, cors);
      }
      if (existing) {
        throw new CheckoutError('La orden todavía se está preparando. Intentá nuevamente.', 409, 'order_in_progress');
      }

      const [product, settings] = await Promise.all([
        firstRow(env, fetchFn, `productos?id=eq.${encodeFilter(productId)}&activo=eq.true&select=*&limit=1`),
        firstRow(env, fetchFn, 'checkout_settings?id=eq.default&select=commission_percent,payments_enabled&limit=1'),
      ]);
      if (!settings?.payments_enabled) {
        throw new CheckoutError('Checkout Pro de prueba todavía no está habilitado.', 503, 'checkout_disabled');
      }
      if (!product) throw new CheckoutError('La pieza no está disponible.', 404, 'product_not_found');

      const selection = {
        wood_type: body.wood_type || null,
        wood_stain: body.wood_stain || null,
        metal_color: body.metal_color || null,
        finish: body.finish || null,
        extras: body.extras || [],
      };
      const priced = priceSelection(product, selection, settings.commission_percent);
      const inserted = await supabaseRequest(env, fetchFn, 'checkout_orders', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          client_request_id: clientRequestId,
          product_id: product.id,
          product_snapshot: { id: product.id, sku: product.sku, nombre: product.nombre },
          selection_snapshot: priced.normalizedSelection,
          subtotal_amount: priced.subtotal,
          commission_percent: Number(settings.commission_percent),
          total_amount: priced.total,
          currency: 'ARS',
          status: 'creating',
        }),
      });
      const localOrder = Array.isArray(inserted) ? inserted[0] : null;
      if (!localOrder?.id) throw new CheckoutError('No se pudo registrar la orden.', 503, 'database_error');

      const baseUrl = normalizeBaseUrl(env.STORE_BASE_URL);
      const amount = `${priced.total}.00`;
      const callbackUrl = `${env.SUPABASE_URL}/functions/v1/mp-order-webhook`;
      const orderPayload = {
        type: 'online',
        processing_mode: 'manual',
        capture_mode: 'automatic',
        total_amount: amount,
        currency: 'ARS',
        external_reference: localOrder.id,
        description: `${product.nombre} · ${product.sku || product.id}`.slice(0, 250),
        expiration_time: 'P1D',
        items: [{
          external_code: String(product.sku || product.id).slice(0, 100),
          title: String(product.nombre).slice(0, 120),
          description: 'Mueble configurado en Acero y Escamas',
          quantity: 1,
          unit_price: amount,
        }],
        config: {
          online: {
            ...returnUrls(baseUrl, localOrder.id),
            callback_url: callbackUrl,
            auto_return: 'approved',
          },
        },
      };

      let mpOrder;
      try {
        mpOrder = await mercadoPagoRequest(env, fetchFn, '/v1/orders', {
          method: 'POST',
          headers: { 'X-Idempotency-Key': clientRequestId },
          body: JSON.stringify(orderPayload),
        });
      } catch (error) {
        await supabaseRequest(env, fetchFn, `checkout_orders?id=eq.${encodeFilter(localOrder.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'failed', status_detail: 'provider_error', updated_at: new Date().toISOString() }),
        }).catch(() => {});
        throw error;
      }

      const checkoutUrl = safeCheckoutUrl(mpOrder.checkout_url);
      if (!mpOrder.id || !checkoutUrl) {
        throw new CheckoutError('Mercado Pago no devolvió un checkout válido.', 502, 'invalid_provider_response');
      }
      await supabaseRequest(env, fetchFn, `checkout_orders?id=eq.${encodeFilter(localOrder.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: String(mpOrder.status || 'created'),
          status_detail: mpOrder.status_detail || null,
          mp_order_id: String(mpOrder.id),
          mp_checkout_url: checkoutUrl,
          updated_at: new Date().toISOString(),
        }),
      });
      return json({ order_id: localOrder.id, checkout_url: checkoutUrl, amount: priced.total, currency: 'ARS' }, 201, cors);
    } catch (error) {
      return publicError(error, cors);
    }
  };
}
