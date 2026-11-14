import { CheckoutError } from './checkout-core.mjs';
import { corsHeaders } from './cors.mjs';
import { encodeFilter, firstRow } from './supabase-rest.mjs';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body, status, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

export function statusHandler(env, fetchFn = fetch) {
  return async request => {
    let cors;
    try { cors = corsHeaders(request, env); }
    catch { return json({ error: 'server_configuration' }, 500); }
    if (!cors) return json({ error: 'origin_not_allowed' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405, cors);
    try {
      const id = new URL(request.url).searchParams.get('order_id') || '';
      if (!UUID_PATTERN.test(id)) throw new CheckoutError('El identificador del pedido no es válido.', 400);
      const order = await firstRow(
        env,
        fetchFn,
        `checkout_orders?id=eq.${encodeFilter(id)}&select=id,status,status_detail,payment_status,total_amount,currency,product_snapshot,updated_at&limit=1`
      );
      if (!order) return json({ error: 'order_not_found' }, 404, cors);
      // Una URL de retorno nunca acredita un pago: los estados antiguos requieren
      // reconciliación por un operador o un nuevo webhook verificado.
      return json({
        order_id: order.id,
        order_status: order.status,
        payment_status: order.payment_status,
        status_detail: order.status_detail,
        amount: order.total_amount,
        currency: order.currency,
        product: { nombre: order.product_snapshot?.nombre || 'Pedido' },
        updated_at: order.updated_at,
      }, 200, cors);
    } catch (error) {
      return json({ error: 'status_unavailable', message: error.message }, error instanceof CheckoutError ? error.status : 500, cors);
    }
  };
}
