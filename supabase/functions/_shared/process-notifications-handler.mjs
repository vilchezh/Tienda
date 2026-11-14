import { dispatchDueOrderNotifications } from './email-notifications.mjs';
import { constantTimeEqual } from './internal-auth.mjs';

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export function processNotificationsHandler(env, fetchFn = fetch) {
  return async request => {
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
    const configuredSecret = env.ORDER_NOTIFICATION_DISPATCH_SECRET;
    const suppliedSecret = request.headers.get('x-dispatch-secret');
    if (!configuredSecret || !constantTimeEqual(configuredSecret, suppliedSecret)) {
      return json({ error: 'not_authorized' }, 401);
    }
    try {
      const result = await dispatchDueOrderNotifications(env, fetchFn, 25);
      return json({ ok: true, ...result }, 200);
    } catch (error) {
      console.error('notification retry failed', error instanceof Error ? error.message : 'unknown');
      return json({ error: 'notification_retry_failed' }, 500);
    }
  };
}
