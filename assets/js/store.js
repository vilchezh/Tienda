/* Small, shared boundaries for editable data. Keep pricing in the existing configurator. */
window.Store = (() => {
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

  return Object.freeze({ escapeHTML, assetURL, whatsappURL, setContactLink, createClient, activeProducts, showStatus });
})();
