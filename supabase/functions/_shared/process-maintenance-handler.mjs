import { constantTimeEqual } from './internal-auth.mjs';
import { supabaseRequest } from './supabase-rest.mjs';

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export function processMaintenanceHandler(env, fetchFn = fetch) {
  return async request => {
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
    const configuredSecret = env.ORDER_MAINTENANCE_SECRET;
    const suppliedSecret = request.headers.get('x-maintenance-secret');
    if (!configuredSecret || !constantTimeEqual(configuredSecret, suppliedSecret)) {
      return json({ error: 'not_authorized' }, 401);
    }
    try {
      const purged = await supabaseRequest(env, fetchFn, 'rpc/checkout_purge_expired_customer_data', {
        method: 'POST',
        body: '{}',
      });
      return json({ ok: true, purged: Number(purged) || 0 }, 200);
    } catch (error) {
      console.error('order maintenance failed', error instanceof Error ? error.message : 'unknown');
      return json({ error: 'maintenance_failed' }, 500);
    }
  };
}
