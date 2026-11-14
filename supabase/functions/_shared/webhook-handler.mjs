import { CheckoutError, paymentStatusFromOrder } from './checkout-core.mjs';
import { encodeFilter, firstRow, supabaseRequest } from './supabase-rest.mjs';
import { verifyMercadoPagoSignature } from './webhook-signature.mjs';

const MERCADO_PAGO_API = 'https://api.mercadopago.com';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

async function fetchRealOrder(env, fetchFn, id) {
  if (!env.MP_ACCESS_TOKEN_TEST) throw new CheckoutError('Falta MP_ACCESS_TOKEN_TEST.', 500, 'server_configuration');
  const response = await fetchFn(`${MERCADO_PAGO_API}/v1/orders/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${env.MP_ACCESS_TOKEN_TEST}`, 'Content-Type': 'application/json' },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new CheckoutError('No se pudo verificar la orden.', 502, 'provider_error');
  return body;
}

export function webhookHandler(env, fetchFn = fetch) {
  return async request => {
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
    try {
      const url = new URL(request.url);
      const dataId = url.searchParams.get('data.id') || '';
      const requestId = request.headers.get('x-request-id') || '';
      const valid = await verifyMercadoPagoSignature({
        signature: request.headers.get('x-signature'),
        requestId,
        dataId,
        secret: env.MP_WEBHOOK_SECRET_TEST,
      });
      if (!valid) return json({ error: 'invalid_signature' }, 401);

      const event = await request.json().catch(() => ({}));
      const bodyId = String(event?.data?.id || '');
      const eventType = String(event?.type || event?.topic || '').toLowerCase();
      if (eventType !== 'order' || !dataId || (bodyId && bodyId !== dataId)) {
        return json({ error: 'invalid_order_event' }, 400);
      }

      const processed = await firstRow(
        env,
        fetchFn,
        `mp_webhook_events?request_id=eq.${encodeFilter(requestId)}&select=id&limit=1`
      );
      if (processed) return json({ ok: true, duplicate: true }, 200);

      const mpOrder = await fetchRealOrder(env, fetchFn, dataId);
      const localId = String(mpOrder.external_reference || '');
      if (!UUID_PATTERN.test(localId) || String(mpOrder.id || '') !== dataId) {
        return json({ error: 'unmatched_order' }, 409);
      }
      const localOrder = await firstRow(
        env,
        fetchFn,
        `checkout_orders?id=eq.${encodeFilter(localId)}&select=id,total_amount,currency,mp_order_id&limit=1`
      );
      if (!localOrder || (localOrder.mp_order_id && String(localOrder.mp_order_id) !== dataId)) {
        return json({ error: 'unmatched_order' }, 409);
      }

      const expectedAmount = Number(localOrder.total_amount);
      const actualAmount = Number(mpOrder.total_amount);
      const amountMatches = Number.isFinite(actualAmount) && actualAmount === expectedAmount;
      const currencyMatches = String(mpOrder.currency || '') === String(localOrder.currency || 'ARS');
      const paymentStatus = paymentStatusFromOrder(mpOrder);
      const verifiedStatus = amountMatches && currencyMatches ? String(mpOrder.status || 'unknown') : 'manual_review';
      const paidAmount = Number(mpOrder.total_paid_amount || 0);

      await supabaseRequest(env, fetchFn, `checkout_orders?id=eq.${encodeFilter(localId)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          mp_order_id: dataId,
          status: verifiedStatus,
          status_detail: amountMatches && currencyMatches ? (mpOrder.status_detail || null) : 'amount_or_currency_mismatch',
          payment_status: amountMatches && currencyMatches ? paymentStatus : 'manual_review',
          mp_paid_amount: Number.isFinite(paidAmount) ? paidAmount : null,
          last_webhook_request_id: requestId,
          updated_at: new Date().toISOString(),
        }),
      });
      await supabaseRequest(env, fetchFn, 'mp_webhook_events', {
        method: 'POST',
        body: JSON.stringify({
          request_id: requestId,
          resource_id: dataId,
          event_type: 'order',
          action: event?.action || null,
          order_status: verifiedStatus,
          payment_status: amountMatches && currencyMatches ? paymentStatus : 'manual_review',
        }),
      });
      return json({ ok: true }, 200);
    } catch (error) {
      console.error('mp-order-webhook failed', error instanceof Error ? error.message : 'unknown');
      return json({ error: 'webhook_processing_failed' }, error instanceof CheckoutError ? error.status : 500);
    }
  };
}
