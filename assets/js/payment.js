(() => {
  const params = new URLSearchParams(location.search);
  const orderId = params.get('pedido') || '';
  const layout = document.getElementById('paymentResult');
  const title = document.getElementById('resultTitle');
  const message = document.getElementById('resultMessage');
  const details = document.getElementById('resultDetails');
  const pill = document.getElementById('resultPill');
  const icon = document.getElementById('resultIcon');
  const next = document.getElementById('resultNext');
  const nextTitle = document.getElementById('resultNextTitle');
  const nextText = document.getElementById('resultNextText');
  const refresh = document.getElementById('btnRefreshStatus');
  const amountBlock = document.getElementById('resultAmountBlock');
  const terminal = new Set(['approved', 'processed', 'rejected', 'failed', 'canceled', 'cancelled', 'refunded', 'partially_refunded', 'charged_back']);
  const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  // Nunca usar el parámetro 'resultado' de Mercado Pago como prueba de acreditación.
  const states = {
    approved: { kind:'success', icon:'✓', tag:'PAGO CONFIRMADO', heading:'¡Tu pago fue confirmado!', detail:'Acreditado', message:'Recibimos la confirmación de tu pago. Revisaremos los detalles antes de comenzar la fabricación.', next:'Te contactaremos para confirmar la configuración y coordinar la fabricación y la entrega. No necesitás pagar otra vez.' },
    processed: { kind:'success', icon:'✓', tag:'PAGO CONFIRMADO', heading:'¡Tu pago fue confirmado!', detail:'Acreditado', message:'Recibimos la confirmación de tu pago. Revisaremos los detalles antes de comenzar la fabricación.', next:'Te contactaremos para confirmar la configuración y coordinar la fabricación y la entrega. No necesitás pagar otra vez.' },
    authorized: { kind:'pending', icon:'·', tag:'EN PROCESO', heading:'Tu pago está autorizado', detail:'En proceso', message:'La autorización todavía no es una acreditación definitiva. Podés volver a consultar el estado.', next:'Esperá la confirmación del pago antes de realizar otra compra.' },
    in_process: { kind:'review', icon:'…', tag:'EN REVISIÓN', heading:'Tu pago está en revisión', detail:'En revisión', message:'Mercado Pago continúa revisando la operación. Todavía no tenemos una acreditación confirmada.', next:'No vuelvas a pagar por el momento. Podés consultar el estado más adelante.' },
    manual_review: { kind:'review', icon:'…', tag:'EN REVISIÓN', heading:'Estamos revisando tu pedido', detail:'En revisión', message:'Tu pedido necesita una verificación adicional. Aún no podemos confirmar el pago.', next:'Esperá nuestra confirmación antes de hacer otro pago.' },
    pending: { kind:'pending', icon:'·', tag:'PAGO PENDIENTE', heading:'Tu pago está pendiente', detail:'Pendiente', message:'Todavía no se acreditó el pago. La operación puede tardar en actualizarse.', next:'Consultá el estado más adelante. Evitá realizar otro pago por el mismo pedido.' },
    created: { kind:'pending', icon:'·', tag:'SIN ACREDITAR', heading:'Recibimos tu pedido', detail:'Pago no confirmado', message:'El pedido se registró, pero todavía no tenemos una acreditación del pago.', next:'Esperá la confirmación antes de intentar pagar nuevamente.' },
    processing: { kind:'pending', icon:'·', tag:'EN PROCESO', heading:'Estamos procesando tu pago', detail:'En proceso', message:'La operación sigue en proceso y todavía no se encuentra acreditada.', next:'Podés volver a consultar el estado en unos minutos.' },
    action_required: { kind:'pending', icon:'·', tag:'ACCIÓN PENDIENTE', heading:'Tu pago necesita una acción', detail:'Acción pendiente', message:'Mercado Pago indicó que hace falta completar un paso antes de confirmar el pago.', next:'Revisá la información de Mercado Pago antes de intentar nuevamente.' },
    rejected: { kind:'failure', icon:'!', tag:'PAGO RECHAZADO', heading:'No se pudo aprobar el pago', detail:'Rechazado', message:'Mercado Pago rechazó la operación. Este pedido no figura como pagado.', next:'Si querés volver a intentarlo, regresá a la tienda. No uses este mensaje como comprobante de pago.' },
    failed: { kind:'failure', icon:'!', tag:'PAGO FALLIDO', heading:'El pago no se completó', detail:'Fallido', message:'La operación no pudo completarse y no se registró una acreditación.', next:'Podés regresar a la tienda y revisar tus opciones.' },
    canceled: { kind:'failure', icon:'!', tag:'PAGO CANCELADO', heading:'El pago fue cancelado', detail:'Cancelado', message:'Esta operación fue cancelada y no figura como acreditada.', next:'Si necesitás realizar el pedido, regresá a la tienda.' },
    cancelled: { kind:'failure', icon:'!', tag:'PAGO CANCELADO', heading:'El pago fue cancelado', detail:'Cancelado', message:'Esta operación fue cancelada y no figura como acreditada.', next:'Si necesitás realizar el pedido, regresá a la tienda.' },
    refunded: { kind:'refund', icon:'↺', tag:'REEMBOLSADO', heading:'Tu pago fue reembolsado', detail:'Reembolsado', message:'Mercado Pago registró el reembolso de esta operación. El pago ya no se considera acreditado.', next:'Si necesitás más información, comunicate con Acero y Escamas.' },
    partially_refunded: { kind:'refund', icon:'↺', tag:'REEMBOLSO PARCIAL', heading:'Se realizó un reembolso parcial', detail:'Reembolso parcial', message:'Mercado Pago registró la devolución de una parte del pago.', next:'Consultanos para confirmar el importe y los próximos pasos.' },
    charged_back: { kind:'refund', icon:'!', tag:'PAGO EN DISPUTA', heading:'Hay una disputa sobre el pago', detail:'Contracargo', message:'Mercado Pago informó un contracargo. La operación requiere revisión.', next:'Comunicate con Acero y Escamas antes de continuar.' },
  };
  const unknown = { kind:'review', icon:'…', tag:'ESTADO EN REVISIÓN', heading:'Estamos verificando tu pedido', detail:'En revisión', message:'No pudimos confirmar una acreditación para este pedido.', next:'Podés volver a consultar el estado más adelante.' };

  function render(entry) {
    layout.dataset.state = entry.kind;
    icon.textContent = entry.icon;
    pill.textContent = entry.tag;
    title.textContent = entry.heading;
    message.textContent = entry.message;
    nextTitle.textContent = 'Próximos pasos';
    nextText.textContent = entry.next || '';
    next.hidden = !entry.next;
  }
  function showError(heading, detail, disableRetry = false) {
    render({ kind:'error', icon:'!', tag:'NO VERIFICADO', heading, message:detail, next:'' });
    details.hidden = true;
    amountBlock.hidden = true;
    refresh.disabled = disableRetry;
  }

  async function loadStatus() {
    if (!UUID_PATTERN.test(orderId)) {
      showError('No encontramos el pedido', 'El enlace no contiene una referencia de pedido válida. Volvé a la tienda para continuar.', true);
      layout.setAttribute('aria-busy', 'false');
      return;
    }
    refresh.disabled = true;
    refresh.textContent = 'Verificando…';
    layout.setAttribute('aria-busy', 'true');
    details.hidden = true;
    amountBlock.hidden = true;
    render({ kind:'loading', icon:'…', tag:'VERIFICANDO PAGO', heading:'Estamos verificando tu pago', message:'Consultamos el estado seguro de tu pedido. Esto no confirma todavía una acreditación.', next:'' });
    try {
      const endpoint = new URL(Store.edgeFunctionURL('get-mp-order-status'));
      endpoint.searchParams.set('order_id', orderId);
      const response = await fetch(endpoint, { headers: { apikey: window.STORE_CONFIG.supabaseAnonKey }, cache:'no-store' });
      if (!response.ok) throw new Error('status');
      const data = await response.json();
      if (!data || typeof data !== 'object' || String(data.order_id || '').toLowerCase() !== orderId.toLowerCase()) throw new Error('order');
      const status = typeof data.payment_status === 'string' ? data.payment_status : '';
      const entry = Object.prototype.hasOwnProperty.call(states, status) ? states[status] : unknown;
      render(entry);
      const product = typeof data.product?.nombre === 'string' ? data.product.nombre.trim() : '';
      document.getElementById('resultProduct').textContent = product || 'Pedido de Acero y Escamas';
      document.getElementById('resultOrder').textContent = '#' + orderId.slice(0, 8).toUpperCase();
      document.getElementById('resultStatus').textContent = entry.detail;
      const amount = Number(data.amount);
      const currency = typeof data.currency === 'string' && /^[A-Z]{3}$/.test(data.currency) ? data.currency : '';
      if (Number.isFinite(amount) && amount > 0 && currency) {
        document.getElementById('resultAmount').textContent = '$' + amount.toLocaleString('es-AR', { maximumFractionDigits: 2 }) + ' ' + currency;
        amountBlock.hidden = false;
      }
      details.hidden = false;
      if (terminal.has(status)) Store.clearCheckoutAttempt(data.order_id);
    } catch {
      showError('No pudimos verificar tu pedido', 'No fue posible consultar el estado en este momento. Intentá actualizarlo más tarde. No hagas otro pago basándote en esta página.');
    } finally {
      layout.setAttribute('aria-busy', 'false');
      if (UUID_PATTERN.test(orderId)) refresh.disabled = false;
      refresh.textContent = 'Actualizar estado';
    }
  }

  refresh.addEventListener('click', loadStatus);
  loadStatus();
})();
