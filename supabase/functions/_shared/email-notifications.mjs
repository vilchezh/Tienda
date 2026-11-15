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

function safePublicImage(env, value) {
  try {
    const base = new URL(String(env.STORE_BASE_URL || ''));
    if (base.protocol !== 'https:' || base.username || base.password) return '';
    const image = new URL(value || '/assets/img/logo.jpg/Code_Generated_Image.png', base);
    return image.protocol === 'https:' && image.origin === base.origin && !image.username && !image.password
      ? image.href : '';
  } catch { return ''; }
}

function deliveryText(customer) {
  if (!customer) return 'Datos no capturados';
  if (customer.delivery_method !== 'delivery') return 'Retiro a coordinar';
  const address = [customer.address_line, customer.city, customer.province, customer.postal_code].filter(Boolean).join(', ');
  return address || 'Envío a domicilio · dirección pendiente de revisión';
}

function tableRows(rows) {
  return rows.filter(([, value]) => value != null && value !== '').map(([label, value]) =>
    `<tr><td style="padding:8px 0;color:#9fb0aa;font-size:12px;vertical-align:top;width:34%">${escapeHTML(label)}</td><td style="padding:8px 0;color:#f4f0e6;font-size:14px;vertical-align:top">${escapeHTML(value)}</td></tr>`
  ).join('');
}

export function orderEmailTemplate(env, notification, order, customer) {
  const product = order.product_snapshot || {};
  const details = selectionLines(order.selection_snapshot);
  const reference = String(product.sku || order.product_id || order.id).slice(0, 120);
  const isCustomer = notification.notification_type === 'customer_payment_confirmed';
  const greeting = isCustomer ? `Hola ${customer?.full_name || ''},` : 'Nueva compra acreditada';
  const subject = emailSubject(isCustomer
    ? `Pago acreditado · ${product.nombre || 'Pedido Acero y Escamas'}`
    : `Nueva compra acreditada · ${reference}`);
  const delivery = deliveryText(customer);
  const image = safePublicImage(env, product.imagen);
  const commonRows = [
    ['Producto', product.nombre || 'Producto'],
    ['Referencia', reference],
    ...details.map(line => line.split(/: (.*)/s).slice(0, 2)),
    ['Importe acreditado', money(order.total_amount)],
    ['Entrega', delivery],
  ];
  const sellerRows = [
    ['Cliente', customer?.full_name || 'Datos no capturados'],
    ['Correo', customer?.email || 'No capturado'],
    ['Teléfono', customer?.phone || 'No capturado'],
    ...commonRows,
    ['Pedido', order.id],
    ['Orden Mercado Pago', order.mp_order_id || 'No registrada'],
    ['Indicaciones', customer?.delivery_notes || 'Sin indicaciones'],
  ];
  const customerRows = [...commonRows, ['Pedido', order.id]];
  const textRows = (isCustomer ? customerRows : sellerRows).map(([label, value]) => `${label}: ${value}`);
  const text = isCustomer ? [
    greeting, '', 'Recibimos la acreditación de tu pago.', ...textRows, '',
    'Próximos pasos: el taller revisará la configuración y se comunicará para confirmar fabricación y entrega.',
    'El pago acreditado no implica que la fabricación haya comenzado.', '', 'Acero y Escamas',
  ].join('\n') : [
    greeting, '', ...textRows, '',
    'Acción: revisar datos y confirmar el estado de fabricación desde el administrador autenticado.',
    'No iniciar fabricación basándose sólo en este correo: verificar el pedido en el panel.',
  ].join('\n');
  const intro = isCustomer
    ? 'Recibimos la acreditación de tu pago. El taller revisará cada detalle antes de confirmar la fabricación.'
    : 'Mercado Pago informó una acreditación. Revisá los datos operativos antes de confirmar la fabricación.';
  const nextStep = isCustomer
    ? 'Próximos pasos: revisaremos la configuración y nos comunicaremos para coordinar fabricación y entrega.'
    : 'Acción requerida: verificá el pedido en el administrador autenticado y confirmá el estado de fabricación.';
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>@media(max-width:620px){.email-shell{width:100%!important}.email-pad{padding:22px 18px!important}.email-title{font-size:24px!important}.email-image{height:180px!important}}</style></head><body style="margin:0;padding:0;background:#0f1516;color:#f4f0e6;font-family:Arial,Helvetica,sans-serif"><div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHTML(subject)} · Pedido ${escapeHTML(String(order.id).slice(0, 8))}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#0f1516"><tr><td align="center" style="padding:24px 10px"><table role="presentation" class="email-shell" width="620" cellspacing="0" cellpadding="0" border="0" style="width:620px;max-width:620px;background:#182021;border:1px solid #435749"><tr><td class="email-pad" style="padding:28px 34px;border-bottom:4px solid #8ca58f"><table role="presentation" width="100%"><tr><td><div style="font-size:10px;letter-spacing:2px;color:#9fb0aa">ACERO Y ESCAMAS · HERRERÍA</div><div style="margin-top:8px;font-size:15px;color:#f4f0e6">Diseño industrial hecho a medida</div></td><td align="right"><span style="display:inline-block;padding:7px 10px;border:1px solid #8ca58f;color:#c5d5c8;font-size:11px">PAGO ACREDITADO</span></td></tr></table></td></tr>${image ? `<tr><td><img class="email-image" src="${escapeHTML(image)}" width="620" height="240" alt="${escapeHTML(product.nombre || 'Acero y Escamas')}" style="display:block;width:100%;height:240px;object-fit:cover;border:0"></td></tr>` : ''}<tr><td class="email-pad" style="padding:34px"><p style="margin:0 0 12px;color:#c5d5c8;font-size:15px">${escapeHTML(greeting)}</p><h1 class="email-title" style="margin:0 0 14px;font-size:28px;line-height:1.2;color:#f4f0e6">${escapeHTML(isCustomer ? 'Tu pago fue acreditado' : 'Nueva compra para revisar')}</h1><p style="margin:0 0 26px;color:#c8d0cb;font-size:15px;line-height:1.65">${escapeHTML(intro)}</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-top:1px solid #435749;border-bottom:1px solid #435749">${tableRows(isCustomer ? customerRows : sellerRows)}</table><div style="margin-top:26px;padding:18px;border-left:4px solid #8ca58f;background:#111819"><p style="margin:0;color:#e7e2d7;font-size:14px;line-height:1.6">${escapeHTML(nextStep)}</p></div><p style="margin:24px 0 0;color:#9fb0aa;font-size:12px;line-height:1.6">El pago y la fabricación son estados independientes. ${escapeHTML(isCustomer ? 'La fabricación todavía no comenzó.' : 'No uses el correo como única fuente de verificación.')}</p></td></tr><tr><td style="padding:20px 34px;background:#111718;color:#83928c;font-size:11px;line-height:1.5">Acero y Escamas · Pedido ${escapeHTML(String(order.id).slice(0, 8).toUpperCase())}</td></tr></table></td></tr></table></body></html>`;
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
    firstRow(env, fetchFn, `checkout_orders?id=eq.${encodeFilter(orderId)}&select=id,product_id,product_snapshot,selection_snapshot,total_amount,currency,mp_order_id,created_at&limit=1`),
    firstRow(env, fetchFn, `checkout_order_customers?order_id=eq.${encodeFilter(orderId)}&select=full_name,email,phone,delivery_method,address_line,city,province,postal_code,delivery_notes&limit=1`),
  ]);
  if (!order) throw new Error('notification order not found');

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
