(() => {
  const params = new URLSearchParams(location.search);
  const orderId = params.get('pedido') || '';
  const title = document.getElementById('resultTitle');
  const message = document.getElementById('resultMessage');
  const details = document.getElementById('resultDetails');
  const refresh = document.getElementById('btnRefreshStatus');
  const labels = {
    approved: ['Pago aprobado', 'Mercado Pago confirmó el pago en su API. Te contactaremos para coordinar la fabricación.'],
    authorized: ['Pago autorizado', 'El pago fue autorizado y continúa su procesamiento.'],
    in_process: ['Pago en revisión', 'Mercado Pago está revisando el pago. Podés actualizar el estado en unos minutos.'],
    pending: ['Pago pendiente', 'El pago todavía está pendiente. Podés actualizar el estado en unos minutos.'],
    rejected: ['Pago rechazado', 'El pago fue rechazado. Podés volver a la tienda e iniciar otro intento.'],
    cancelled: ['Pago cancelado', 'La operación fue cancelada.'],
    manual_review: ['Pedido en revisión', 'Detectamos una diferencia y el pedido requiere revisión manual.'],
  };

  async function loadStatus() {
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) {
      title.textContent = 'No encontramos el pedido';
      message.textContent = 'El enlace de retorno no contiene un identificador válido.';
      refresh.disabled = true;
      return;
    }
    refresh.disabled = true;
    refresh.textContent = 'Verificando…';
    try {
      const endpoint = new URL(Store.edgeFunctionURL('get-mp-order-status'));
      endpoint.searchParams.set('order_id', orderId);
      const response = await fetch(endpoint, { headers: { apikey: window.STORE_CONFIG.supabaseAnonKey } });
      const data = await response.json();
      if (!response.ok) throw new Error('status');
      const status = data.payment_status || data.order_status || 'pending';
      const copy = labels[status] || ['Pedido recibido', 'Todavía no hay un estado final confirmado.'];
      title.textContent = copy[0];
      message.textContent = copy[1];
      document.getElementById('resultOrder').textContent = String(data.order_id).slice(0, 8).toUpperCase();
      document.getElementById('resultAmount').textContent = `$${Number(data.amount).toLocaleString('es-AR')} ${data.currency}`;
      document.getElementById('resultStatus').textContent = status;
      details.hidden = false;
    } catch {
      title.textContent = 'No pudimos verificar el estado';
      message.textContent = 'La notificación puede estar demorada. Volvé a intentar en unos minutos; no tomamos la URL de retorno como confirmación de pago.';
    } finally {
      refresh.disabled = false;
      refresh.textContent = 'Actualizar estado';
    }
  }

  refresh.addEventListener('click', loadStatus);
  loadStatus();
})();
