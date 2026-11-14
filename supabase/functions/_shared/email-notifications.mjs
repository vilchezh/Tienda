import { encodeFilter, firstRow, supabaseRequest } from './supabase-rest.mjs';

const RESEND_API = 'https://api.resend.com/emails';

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function money(value) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(Number(value) || 0);
}

function selectionLines(selection = {}) {
  const rows = [
    ['Madera', selection.wood_type],
    ['Tono', selection.wood_stain],
    ['Metal', selection.metal_color],
    ['Acabado', selection.finish],
    ['Extras', Array.isArray(selection.extras) && selection.extras.length ? selection.extras.join(', ') : 'Ninguno'],
  ];
  return rows.filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`);
}

function template(notification, order, customer) {
  const product = order.product_snapshot || {};
  const details = selectionLines(order.selection_snapshot);
  const reference = String(product.sku || order.product_id || order.id).slice(0, 120);
  const isCustomer = notification.notification_type === 'customer_payment_confirmed';
  const greeting = isCustomer ? `Hola ${customer?.full_name || ''},` : 'Se acreditó una nueva compra.';
  const subject = isCustomer
    ? `Pago acreditado · ${product.nombre || 'Pedido Acero y Escamas'}`
    : `Nueva compra acreditada · ${reference}`;
  const text = [
    greeting,
    '',
    isCustomer ? 'Recibimos la acreditación de tu pago. El taller revisará el pedido antes de iniciar la fabricación.' : '',
    `Pedido: ${order.id}`,
    `Producto: ${product.nombre || 'Producto'}`,
    `Referencia: ${reference}`,
    ...details,
    `Importe acreditado: ${money(order.total_amount)}`,
    '',
    'El estado de fabricación se gestiona por separado del estado del pago.',
    'Acero y Escamas',
  ].filter(line => line !== '').join('\n');
  const detailHTML = details.map(line => `<li>${escapeHTML(line)}</li>`).join('');
  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#141a1a;color:#f5f3eb;font-family:Arial,sans-serif"><div style="max-width:620px;margin:auto;padding:32px"><p>${escapeHTML(greeting)}</p>${isCustomer ? '<p>Recibimos la acreditación de tu pago. El taller revisará el pedido antes de iniciar la fabricación.</p>' : ''}<div style="border:1px solid #75927e;padding:20px"><h1 style="font-size:20px;margin-top:0">${escapeHTML(product.nombre || 'Pedido Acero y Escamas')}</h1><p><strong>Referencia:</strong> ${escapeHTML(reference)}</p><ul>${detailHTML}</ul><p style="font-size:22px;color:#a8c8b2"><strong>${escapeHTML(money(order.total_amount))}</strong></p><p style="font-size:12px;color:#9cb0a2">Pedido ${escapeHTML(order.id)}</p></div><p style="color:#9cb0a2">El estado de fabricación se gestiona por separado del estado del pago.</p><p>Acero y Escamas</p></div></body></html>`;
  return { subject, text, html };
}

async function mark(env, fetchFn, id, body) {
  return supabaseRequest(env, fetchFn, `checkout_email_outbox?id=eq.${encodeFilter(id)}&status=eq.processing`, {
    method: 'PATCH',
    body: JSON.stringify({ ...body, locked_at: null, updated_at: new Date().toISOString() }),
  });
}

async function markDeliveryFailure(env, fetchFn, notification, errorCode) {
  const delayMinutes = Math.min(360, 2 ** Math.min(Number(notification.attempt_count) || 1, 8));
  await mark(env, fetchFn, notification.id, {
    status: 'failed',
    last_error: String(errorCode || 'delivery_failed').slice(0, 500),
    next_attempt_at: new Date(Date.now() + delayMinutes * 60000).toISOString(),
  }).catch(() => {});
}

export async function dispatchOrderNotifications(env, fetchFn, orderId) {
  if (!env.RESEND_API_KEY || !env.ORDER_EMAIL_FROM) return { configured: false, processed: 0 };
  const claimed = await supabaseRequest(env, fetchFn, 'rpc/checkout_claim_notifications', {
    method: 'POST', body: JSON.stringify({ p_order_id: orderId }),
  });
  if (!Array.isArray(claimed) || claimed.length === 0) return { configured: true, processed: 0 };

  const [order, customer] = await Promise.all([
    firstRow(env, fetchFn, `checkout_orders?id=eq.${encodeFilter(orderId)}&select=id,product_id,product_snapshot,selection_snapshot,total_amount,currency,created_at&limit=1`),
    firstRow(env, fetchFn, `checkout_order_customers?order_id=eq.${encodeFilter(orderId)}&select=full_name,email&limit=1`),
  ]);
  if (!order) throw new Error('notification order not found');

  let processed = 0;
  for (const notification of claimed) {
    const recipient = notification.notification_type === 'seller_payment_received'
      ? String(env.ORDER_NOTIFICATION_TO || '').trim()
      : String(notification.recipient_email || customer?.email || '').trim();
    if (!recipient) {
      await markDeliveryFailure(env, fetchFn, notification, 'recipient_not_configured');
      continue;
    }
    const content = template(notification, order, customer);
    let response;
    let result;
    try {
      response = await fetchFn(RESEND_API, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `checkout-${orderId}-${notification.notification_type}`,
        },
        body: JSON.stringify({ from: env.ORDER_EMAIL_FROM, to: [recipient], ...content }),
      });
      result = await response.json().catch(() => ({}));
    } catch {
      // No es posible saber si el proveedor aceptó la solicitud. Se reintenta
      // sólo dentro de la ventana local usando exactamente la misma clave.
      await markDeliveryFailure(env, fetchFn, notification, 'provider_outcome_uncertain');
      continue;
    }
    if (!response.ok) {
      await markDeliveryFailure(env, fetchFn, notification, `provider_${response.status}`);
      continue;
    }
    if (!result?.id) {
      await markDeliveryFailure(env, fetchFn, notification, 'provider_outcome_uncertain');
      continue;
    }
    try {
      await mark(env, fetchFn, notification.id, {
        status: 'sent', provider_message_id: String(result.id).slice(0, 200),
        last_error: null, sent_at: new Date().toISOString(),
      });
      processed += 1;
    } catch (error) {
      // Resend confirmó la aceptación. Si Supabase falla, no degradamos la fila
      // a failed: queda processing y sólo podrá reclamarse con la misma clave
      // mientras siga vigente. Así evitamos un segundo envío sin protección.
      console.error('notification accepted but persistence failed', notification.id,
        error instanceof Error ? error.message : 'unknown');
    }
  }
  return { configured: true, processed };
}

export async function dispatchDueOrderNotifications(env, fetchFn, limit = 25) {
  if (!env.RESEND_API_KEY || !env.ORDER_EMAIL_FROM) return { configured: false, orders: 0, processed: 0 };
  await supabaseRequest(env, fetchFn, 'rpc/checkout_expire_uncertain_notifications', {
    method: 'POST', body: '{}',
  });
  const due = await supabaseRequest(env, fetchFn, 'rpc/checkout_due_notification_orders', {
    method: 'POST', body: JSON.stringify({ p_limit: Math.min(Math.max(Number(limit) || 25, 1), 100) }),
  });
  const orderIds = Array.isArray(due) ? [...new Set(due.map(row => row?.order_id).filter(Boolean))] : [];
  let processed = 0;
  for (const orderId of orderIds) {
    const result = await dispatchOrderNotifications(env, fetchFn, orderId);
    processed += result.processed;
  }
  return { configured: true, orders: orderIds.length, processed };
}
