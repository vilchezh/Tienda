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

function emailSubject(value) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180);
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


function deliveryText(customer) {
  if (!customer) return 'Datos no capturados';
  if (customer.delivery_method !== 'delivery') return 'Retiro a coordinar';
  const address = [customer.address_line, customer.city, customer.province, customer.postal_code].filter(Boolean).join(', ');
  return address || 'Envío a domicilio · dirección pendiente de revisión';
}

function tableRows(rows) {
  return rows.filter(([, value]) => value != null && value !== '').map(([label, value]) =>
    `<tr><td style="padding:8px 0;color:#52665a;font-size:12px;vertical-align:top;width:36%;line-height:1.5">${escapeHTML(label)}</td><td style="padding:8px 0;color:#17251e;font-size:14px;vertical-align:top;line-height:1.5;word-break:break-word;overflow-wrap:anywhere">${escapeHTML(value)}</td></tr>`
  ).join('');
}

export function orderEmailTemplate(env, notification, order, customer) {
  const product = order.product_snapshot || {};
  const reference = String(product.sku || order.product_id || order.id).slice(0, 120);
  const orderCode = String(order.id || '').slice(0, 8).toUpperCase();
  const isCustomer = notification.notification_type === 'customer_payment_confirmed';
  const customerName = String(customer?.full_name || '').trim();
  const greeting = isCustomer ? (customerName ? 'Hola ' + customerName + ',' : 'Hola,') : 'Nueva venta acreditada';
  const subject = emailSubject(isCustomer
    ? 'Pago acreditado · ' + (product.nombre || 'Acero y Escamas')
    : 'Nueva compra acreditada · ' + reference);
  const title = isCustomer ? '¡Tu pago fue confirmado!' : 'Nueva venta acreditada';
  const intro = isCustomer
    ? 'Recibimos tu pago y registramos el pedido. Revisaremos los detalles y te contactaremos para coordinar la entrega.'
    : 'Se acreditó una compra en la tienda. Revisá los datos del pedido en el panel antes de comenzar la preparación.';
  const nextStep = isCustomer
    ? 'Te contactaremos para confirmar los detalles y coordinar la fabricación y la entrega. No necesitás realizar otro pago.'
    : 'Ingresá al administrador, verificá la acreditación y revisá los datos del cliente antes de preparar el pedido.';
  const details = selectionLines(order.selection_snapshot);
  const commonRows = [
    ['Producto', product.nombre || 'Producto'],
    ['Referencia', reference],
    ...details.map(line => line.split(/: (.*)/s).slice(0, 2)),
    ['Entrega', deliveryText(customer)],
    ['Pedido', '#' + orderCode],
  ];
  const sellerRows = [
    ['Cliente', customer?.full_name || 'No capturado'],
    ['Correo', customer?.email || 'No capturado'],
    ['Teléfono', customer?.phone || 'No capturado'],
    ...commonRows,
    ['ID interno', order.id],
    ['Orden Mercado Pago', order.mp_order_id || 'No registrada'],
    ['Indicaciones', customer?.delivery_notes || 'Sin indicaciones'],
  ];
  const rows = isCustomer ? commonRows : sellerRows;
  const text = [
    subject, '', greeting, '', intro, '',
    'Importe acreditado: ' + money(order.total_amount),
    ...rows.map(([label, value]) => label + ': ' + String(value ?? '')),
    '', 'Próximos pasos: ' + nextStep, '', 'Acero y Escamas',
  ].join('\n');
  const html = [
    "<!doctype html><html lang=\"es\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><style>@media(max-width:620px){.email-shell{width:100%!important}.email-pad{padding:20px 18px!important}.email-title{font-size:24px!important;line-height:1.2!important}.email-amount{font-size:29px!important}}</style></head>",
    "<body style=\"margin:0;padding:0;background:#eef2ee;color:#17251e;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;\">",
    "<div style=\"display:none!important;visibility:hidden;max-height:0;overflow:hidden;opacity:0;color:transparent;\">",
    escapeHTML(subject),
    "</div><table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:100%;background:#eef2ee;\"><tr><td align=\"center\" style=\"padding:16px 10px;\">",
    "<table role=\"presentation\" class=\"email-shell\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:100%;max-width:560px;table-layout:fixed;background:#ffffff;border:1px solid #d8e3da;\">",
    "<tr><td class=\"email-pad\" style=\"padding:24px 28px;background:#0f3d2e;color:#ffffff;\">",
    "<img src=\"https://tienda-checkout-sandbox.acero-y-escamas.workers.dev/assets/img/email-pangolin-muted-green.png\" alt=\"Logo de Acero y Escamas\" width=\"64\" height=\"64\" align=\"right\" style=\"display:block;float:right;width:64px;height:64px;margin:15px 0 0 8px;border:0;outline:none;text-decoration:none;\">",
    "<div style=\"font-size:20px;font-weight:700;letter-spacing:1px;line-height:1.35;\">ACERO Y ESCAMAS</div>",
    "<div style=\"font-size:13px;color:#d2e3d8;margin-top:5px;line-height:1.45;\">Herrería y muebles a medida</div>",
    "<div style=\"font-size:11px;font-weight:700;letter-spacing:1px;color:#0f3d2e;background:#e5f2e8;display:inline-block;padding:7px 11px;margin-top:17px;\">PAGO ACREDITADO</div></td></tr>",
    "<tr><td class=\"email-pad\" style=\"padding:28px;color:#17251e;\">",
    "<p style=\"font-size:15px;margin:0 0 10px;line-height:1.5;color:#41574b;\">",
    escapeHTML(greeting),
    "</p><h1 class=\"email-title\" style=\"font-size:27px;line-height:1.25;margin:0 0 12px;color:#153c2a;\">",
    escapeHTML(title),
    "</h1><p style=\"font-size:15px;line-height:1.65;margin:0 0 22px;color:#394a40;\">",
    escapeHTML(intro),
    "</p><table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:100%;margin-bottom:24px;\"><tr><td style=\"background:#e9f4ed;border-left:4px solid #0f3d2e;padding:15px 18px;\">",
    "<div style=\"font-size:11px;line-height:1.4;letter-spacing:1px;font-weight:700;color:#42644e;\">IMPORTE ACREDITADO</div>",
    "<div class=\"email-amount\" style=\"font-size:32px;line-height:1.3;font-weight:700;margin-top:4px;color:#0f3d2e;\">",
    escapeHTML(money(order.total_amount)),
    "</div></td></tr></table>",
    "<h2 style=\"font-size:17px;margin:0 0 12px;color:#153c2a;\">Detalle del pedido</h2>",
    "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:100%;border-top:1px solid #d8e3da;border-bottom:1px solid #d8e3da;table-layout:fixed;\">",
    tableRows(rows),
    "</table><table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:100%;margin-top:24px;\"><tr><td style=\"background:#f2f6f3;padding:17px 18px;border-left:3px solid #6e997c;\">",
    "<div style=\"font-size:14px;font-weight:700;color:#173e2c;margin-bottom:6px;\">Próximos pasos</div>",
    "<div style=\"font-size:14px;line-height:1.6;color:#374d40;\">",
    escapeHTML(nextStep),
    "</div></td></tr></table></td></tr>",
    "<tr><td class=\"email-pad\" style=\"padding:18px 28px;background:#f6f8f6;color:#52665a;font-size:12px;line-height:1.5;\">Acero y Escamas · Pedido #",
    escapeHTML(orderCode),
    "</td></tr></table></td></tr></table></body></html>",
  ].join('');
  return { subject, text, html };
}
export function providerFailure(status) {
  const code = Number(status);
  if (code === 401) return { code: 'provider_authentication_failed', permanent: true };
  if (code === 403) return { code: 'provider_forbidden', permanent: true };
  if ([400, 404, 422].includes(code)) return { code: 'provider_request_rejected', permanent: true };
  if (code === 429) return { code: 'provider_rate_limited', permanent: false };
  return { code: `provider_${Number.isFinite(code) ? code : 'error'}`, permanent: false };
}

async function mark(env, fetchFn, id, body) {
  return supabaseRequest(env, fetchFn, `checkout_email_outbox?id=eq.${encodeFilter(id)}&status=eq.processing`, {
    method: 'PATCH',
    body: JSON.stringify({ ...body, locked_at: null, updated_at: new Date().toISOString() }),
  });
}

async function markDeliveryFailure(env, fetchFn, notification, errorCode, permanent = false) {
  const delayMinutes = Math.min(360, 2 ** Math.min(Number(notification.attempt_count) || 1, 8));
  await mark(env, fetchFn, notification.id, {
    status: permanent ? 'rejected' : 'failed',
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
    firstRow(env, fetchFn, `checkout_orders?id=eq.${encodeFilter(orderId)}&select=id,product_id,product_snapshot,selection_snapshot,total_amount,currency,mp_order_id,payment_status,created_at&limit=1`),
    firstRow(env, fetchFn, `checkout_order_customers?order_id=eq.${encodeFilter(orderId)}&select=full_name,email,phone,delivery_method,address_line,city,province,postal_code,delivery_notes&limit=1`),
  ]);
  if (!order) throw new Error('notification order not found');

  // Un reembolso o contracargo puede llegar entre el reclamo y un reintento.
  // En ese caso ya no corresponde enviar un aviso de pago acreditado.
  if (order.payment_status !== 'processed') {
    for (const notification of claimed) {
      await markDeliveryFailure(env, fetchFn, notification, 'payment_no_longer_accredited', true);
    }
    return { configured: true, processed: 0 };
  }

  let processed = 0;
  for (const notification of claimed) {
    const recipient = notification.notification_type === 'seller_payment_received'
      ? String(env.ORDER_NOTIFICATION_TO || '').trim()
      : String(notification.recipient_email || customer?.email || '').trim();
    if (!recipient) {
      await markDeliveryFailure(env, fetchFn, notification, 'recipient_not_configured', true);
      continue;
    }
    const content = orderEmailTemplate(env, notification, order, customer);
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
      const failure = providerFailure(response.status);
      await markDeliveryFailure(env, fetchFn, notification, failure.code, failure.permanent);
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
      console.error('notification accepted but persistence failed');
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
