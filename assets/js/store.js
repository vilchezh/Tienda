/* Small, shared boundaries for editable data. Keep pricing in the existing configurator. */
window.Store = (() => {
  const CHECKOUT_ATTEMPT_KEY = 'acero-y-escamas.checkout-attempt.v1';
  const CHECKOUT_ATTEMPT_TTL_MS = 24 * 60 * 60 * 1000;
  let volatileCheckoutAttempt = null;
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);

  function assetURL(value) {
    if (typeof value !== 'string' || !value.trim()) return '';
    try {
      const url = new URL(value, location.href);
      // Local assets and HTTPS media only. No javascript:, data:, credentials or HTTP trackers.
      if (url.username || url.password) return '';
      return url.protocol === 'https:' || (url.origin === location.origin && url.protocol === 'http:')
        ? url.href : '';
    } catch { return ''; }
  }

  function whatsappURL(message) {
    const phone = window.STORE_CONFIG.whatsappNumber;
    return /^[1-9]\d{7,14}$/.test(phone)
      ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}` : '';
  }

  function setContactLink(link, message) {
    const url = whatsappURL(message);
    link.removeAttribute('href');
    link.setAttribute('aria-disabled', String(!url));
    link.setAttribute('role', 'link');
    link.tabIndex = 0;
    if (url) link.href = url;
    link.title = url ? 'Consultar por WhatsApp' : 'WhatsApp aún no está disponible';
  }

  function createClient() {
    if (!window.supabase) throw new Error('No se pudo cargar la conexión con la tienda.');
    return window.supabase.createClient(window.STORE_CONFIG.supabaseUrl, window.STORE_CONFIG.supabaseAnonKey);
  }

  async function activeProducts(client, id) {
    let query = client.from('productos').select('*').eq('activo', true);
    if (id !== undefined) query = query.eq('id', id);
    const { data, error } = await query.abortSignal(AbortSignal.timeout(8000));
    if (error || !Array.isArray(data)) throw new Error('No pudimos consultar el catálogo.');
    // Defense in depth, including admin sessions whose RLS can also read hidden rows.
    return data.filter(product => product.activo === true);
  }

  async function checkoutSettings(client) {
    const { data, error } = await client
      .from('checkout_settings')
      .select('commission_percent,payments_enabled')
      .eq('id', 'default')
      .maybeSingle()
      .abortSignal(AbortSignal.timeout(8000));
    if (error || !data) throw new Error('Checkout no disponible.');
    return {
      commissionPercent: Number(data.commission_percent),
      paymentsEnabled: data.payments_enabled === true,
    };
  }

  function priceBreakdown(base, wood, extras, percent) {
    return globalThis.StorePricing.breakdown(base, wood, extras, percent);
  }

  function defaultWoodDelta(product) {
    const wood = (Array.isArray(product.maderas) ? product.maderas : []).find(item => item && item.activo !== false);
    return wood ? Number(wood.delta || 0) : 0;
  }

  function checkoutTotal(subtotal, commissionPercent) {
    try { return priceBreakdown(subtotal, 0, 0, commissionPercent).total; }
    catch { return 0; }
  }

  function checkoutURL(value) {
    try {
      const url = new URL(value);
      const validHost = /(^|\.)mercadopago\.com(\.[a-z]{2})?$/i.test(url.hostname);
      return url.protocol === 'https:' && validHost && !url.username && !url.password ? url.href : '';
    } catch { return ''; }
  }

  function edgeFunctionURL(name) {
    if (!/^[a-z0-9-]+$/.test(name)) return '';
    try {
      const url = new URL(window.STORE_CONFIG.supabaseUrl);
      if (url.protocol !== 'https:') return '';
      return `${url.origin}/functions/v1/${name}`;
    } catch { return ''; }
  }

  function stableJSON(value) {
    if (Array.isArray(value)) return `[${value.map(stableJSON).join(',')}]`;
    if (value && typeof value === 'object') {
      return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJSON(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
  }

  async function checkoutFingerprint(payload) {
    const bytes = new TextEncoder().encode(stableJSON(payload));
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  }

  function readCheckoutAttempt() {
    let value = volatileCheckoutAttempt;
    try {
      const stored = sessionStorage.getItem(CHECKOUT_ATTEMPT_KEY);
      if (stored) value = JSON.parse(stored);
    } catch { /* La recuperación en memoria sigue disponible. */ }
    const valid = value && /^[0-9a-f-]{36}$/i.test(value.requestId) &&
      typeof value.fingerprint === 'string' &&
      Number.isFinite(Number(value.createdAt)) &&
      Date.now() - Number(value.createdAt) < CHECKOUT_ATTEMPT_TTL_MS;
    if (valid) return value;
    clearCheckoutAttempt();
    return null;
  }

  function writeCheckoutAttempt(value) {
    volatileCheckoutAttempt = value;
    try { sessionStorage.setItem(CHECKOUT_ATTEMPT_KEY, JSON.stringify(value)); }
    catch { /* No impedir el checkout si el almacenamiento está bloqueado. */ }
  }

  async function checkoutAttempt(productId, payload) {
    const fingerprint = await checkoutFingerprint(payload);
    const current = readCheckoutAttempt();
    if (current && current.productId === String(productId) && current.fingerprint === fingerprint) return current;
    const next = {
      requestId: crypto.randomUUID(),
      productId: String(productId),
      fingerprint,
      orderId: null,
      createdAt: Date.now(),
    };
    writeCheckoutAttempt(next);
    return next;
  }

  function recordCheckoutOrder(requestId, orderId) {
    const current = readCheckoutAttempt();
    if (!current || current.requestId !== requestId || !/^[0-9a-f-]{36}$/i.test(String(orderId || ''))) return;
    writeCheckoutAttempt({ ...current, orderId: String(orderId) });
  }

  function clearCheckoutAttempt(orderId = null, productId = null) {
    let current = volatileCheckoutAttempt;
    try {
      const stored = sessionStorage.getItem(CHECKOUT_ATTEMPT_KEY);
      if (stored) current = JSON.parse(stored);
    } catch { /* Limpiar lo que sea posible. */ }
    if (orderId && current?.orderId !== String(orderId)) return false;
    if (productId && current?.productId !== String(productId)) return false;
    volatileCheckoutAttempt = null;
    try { sessionStorage.removeItem(CHECKOUT_ATTEMPT_KEY); }
    catch { /* No hay nada más que limpiar. */ }
    return true;
  }

  function showStatus(container, message, retry) {
    const panel = document.createElement('div');
    panel.className = 'empty-state';
    panel.setAttribute('role', 'status');
    const text = document.createElement('p');
    text.textContent = message;
    panel.append(text);
    if (retry) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'button button-primary';
      button.textContent = 'Volver a intentar';
      button.addEventListener('click', retry);
      panel.append(button);
    }
    container.replaceChildren(panel);
  }

  return Object.freeze({
    escapeHTML, assetURL, whatsappURL, setContactLink, createClient, activeProducts,
    checkoutSettings, priceBreakdown, defaultWoodDelta, checkoutTotal, checkoutURL, edgeFunctionURL, showStatus,
    checkoutAttempt, recordCheckoutOrder, clearCheckoutAttempt
  });
})();
