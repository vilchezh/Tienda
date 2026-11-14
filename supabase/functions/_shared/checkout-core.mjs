const MAX_COMMISSION_PERCENT = 50;
const ROUNDING_UNIT = 1000;

export class CheckoutError extends Error {
  constructor(message, status = 400, code = 'invalid_checkout') {
    super(message);
    this.name = 'CheckoutError';
    this.status = status;
    this.code = code;
  }
}

function asIntegerMoney(value, field) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new CheckoutError(`${field} no es un importe entero válido.`, 422, 'invalid_catalog_price');
  }
  return number;
}

export function calculateCheckoutTotal(subtotal, commissionPercent) {
  const safeSubtotal = asIntegerMoney(subtotal, 'El subtotal');
  const percent = Number(commissionPercent);
  if (!Number.isFinite(percent) || percent < 0 || percent > MAX_COMMISSION_PERCENT) {
    throw new CheckoutError('La comisión configurada no es válida.', 422, 'invalid_commission');
  }
  const basisPoints = Math.round(percent * 100);
  const amountWithCommission = Math.ceil((safeSubtotal * (10000 + basisPoints)) / 10000);
  return Math.ceil(amountWithCommission / ROUNDING_UNIT) * ROUNDING_UNIT;
}

function activeByName(items, name, label, required = true) {
  if (!name && !required) return null;
  const match = (Array.isArray(items) ? items : []).find(item =>
    item && item.activo !== false && String(item.nombre) === String(name)
  );
  if (!match) throw new CheckoutError(`${label} ya no está disponible.`, 409, 'selection_unavailable');
  return match;
}

export function priceSelection(product, selection, commissionPercent) {
  if (!product || product.activo !== true || product.checkout_habilitado !== true) {
    throw new CheckoutError('Esta pieza no está habilitada para compra online.', 409, 'checkout_disabled');
  }

  const base = asIntegerMoney(product.precio_base, 'El precio base');
  const woods = Array.isArray(product.maderas) ? product.maderas.filter(item => item?.activo !== false) : [];
  const wood = woods.length ? activeByName(woods, selection.wood_type, 'La madera') : null;
  const woodDelta = wood ? asIntegerMoney(wood.delta || 0, 'El recargo de madera') : 0;

  const selectedExtraNames = Array.isArray(selection.extras) ? selection.extras.map(String) : [];
  if (new Set(selectedExtraNames).size !== selectedExtraNames.length || selectedExtraNames.length > 20) {
    throw new CheckoutError('La selección de extras no es válida.', 400, 'invalid_extras');
  }
  const extras = selectedExtraNames.map(name => activeByName(product.extras, name, 'Un extra'));
  const extrasAmount = extras.reduce((total, item) => total + asIntegerMoney(item.precio || 0, 'El precio de un extra'), 0);

  activeByName(product.tonos_madera, selection.wood_stain, 'El tono de madera', !selection.wood_stain ? false : true);
  activeByName(product.colores_metal, selection.metal_color, 'El color de metal', !selection.metal_color ? false : true);
  activeByName(product.acabados, selection.finish, 'El acabado', !selection.finish ? false : true);

  const subtotal = base + woodDelta + extrasAmount;
  return {
    subtotal,
    total: calculateCheckoutTotal(subtotal, commissionPercent),
    normalizedSelection: {
      wood_type: wood?.nombre || null,
      wood_stain: selection.wood_stain || null,
      metal_color: selection.metal_color || null,
      finish: selection.finish || null,
      extras: extras.map(item => item.nombre),
    },
  };
}

export function normalizeBaseUrl(value) {
  let url;
  try { url = new URL(String(value || '')); }
  catch { throw new CheckoutError('STORE_BASE_URL no es una URL válida.', 500, 'server_configuration'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new CheckoutError('STORE_BASE_URL debe ser una URL HTTPS limpia.', 500, 'server_configuration');
  }
  return url.origin + url.pathname.replace(/\/$/, '');
}

export function safeCheckoutUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const mercadoPagoHost = /(^|\.)mercadopago\.com(\.[a-z]{2})?$/.test(host);
    return url.protocol === 'https:' && mercadoPagoHost && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}

export function paymentStatusFromOrder(order) {
  const payments = Array.isArray(order?.transactions?.payments) ? order.transactions.payments : [];
  const statuses = payments.map(payment => String(payment?.status || '')).filter(Boolean);
  const priority = ['approved', 'authorized', 'in_process', 'pending', 'rejected', 'cancelled', 'refunded', 'charged_back'];
  return priority.find(status => statuses.includes(status)) || statuses[0] || null;
}
