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

      if (Number(request.headers.get('content-length') || 0) > 8192) return json({ error: 'request_too_large' }, 413);
      const raw = await request.text();
      if (new TextEncoder().encode(raw).length > 8192) return json({ error: 'request_too_large' }, 413);
      const event = JSON.parse(raw);
      const bodyId = String(event?.data?.id || '');
      const eventType = String(event?.type || event?.topic || '').toLowerCase();
      if (eventType !== 'order' || !dataId || (bodyId && bodyId !== dataId)) {
        return json({ error: 'invalid_order_event' }, 400);
      }

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
      const paidAmount = Number(mpOrder.total_paid_amount);
      const paymentStatus = paymentStatusFromOrder(mpOrder);
      const processed = paymentStatus === 'processed';
      const amountCredited = Number.isFinite(paidAmount) && paidAmount >= expectedAmount;
      const verifiedStatus = amountMatches && currencyMatches ? String(mpOrder.status || 'unknown') : 'manual_review';
      const effectiveStatus = amountMatches && currencyMatches && (!processed || amountCredited) ? paymentStatus : 'manual_review';

      await supabaseRequest(env, fetchFn, 'rpc/checkout_record_verified_order', {
        method: 'POST',
        body: JSON.stringify({
          p_id: localId, p_mp_id: dataId, p_request_id: requestId,
          p_action: String(event?.action || '').slice(0, 120),
          p_status: verifiedStatus, p_payment_status: effectiveStatus,
          p_detail: effectiveStatus === 'manual_review' ? 'amount_currency_or_credit_mismatch' : (mpOrder.status_detail || null),
          p_paid: Number.isFinite(paidAmount) ? paidAmount : null,
        }),
      });
      return json({ ok: true }, 200);
    } catch (error) {
      console.error('mp-order-webhook failed', error instanceof Error ? error.message : 'unknown');
      return json({ error: 'webhook_processing_failed' }, error instanceof CheckoutError ? error.status : 500);
    }
  };
}
