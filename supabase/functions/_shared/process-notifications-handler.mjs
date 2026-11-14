import { dispatchDueOrderNotifications } from './email-notifications.mjs';

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function constantTimeEqual(left, right) {
  const a = new TextEncoder().encode(String(left || ''));
  const b = new TextEncoder().encode(String(right || ''));
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) difference |= (a[index] || 0) ^ (b[index] || 0);
  return difference === 0 && a.length > 0;
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
