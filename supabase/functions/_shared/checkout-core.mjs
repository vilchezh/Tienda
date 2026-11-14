import '../../../assets/js/pricing.js';

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
  try { return globalThis.StorePricing.breakdown(safeSubtotal, 0, 0, commissionPercent).total; }
  catch { throw new CheckoutError('La comisión configurada no es válida.', 422, 'invalid_commission'); }
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

  let breakdown;
  try { breakdown = globalThis.StorePricing.breakdown(base, woodDelta, extrasAmount, commissionPercent); }
  catch { throw new CheckoutError('El total no es válido.', 422, 'invalid_catalog_price'); }
  return {
    subtotal: breakdown.subtotal,
    total: breakdown.total,
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
  const refunds = Array.isArray(order?.transactions?.refunds) ? order.transactions.refunds : [];
  const chargebacks = Array.isArray(order?.transactions?.chargebacks) ? order.transactions.chargebacks : [];
  const statuses = payments.map(payment => String(payment?.status || '')).filter(Boolean);
  const orderStatus = String(order?.status || '');
  if (chargebacks.length || ['charged_back', 'chargeback'].some(s => statuses.includes(s)) || orderStatus === 'charged_back') return 'charged_back';
  if (statuses.includes('refunded') || orderStatus === 'refunded') return 'refunded';
  if (statuses.includes('partially_refunded') || orderStatus === 'partially_refunded') return 'partially_refunded';
  const refundAmount = payments.reduce((sum, payment) => sum + Number(payment?.refunded_amount || 0), 0);
  if (refunds.length || refundAmount > 0) {
    const total = Number(order?.total_paid_amount);
    return Number.isFinite(total) && refundAmount >= total && total > 0 ? 'refunded' : 'partially_refunded';
  }
  if (['canceled', 'cancelled'].includes(orderStatus)) return 'canceled';
  if (orderStatus === 'failed') return 'failed';
  if (['processed', 'approved'].includes(orderStatus)) return 'processed';
  if (statuses.includes('processed') || statuses.includes('approved')) return 'processing';
  if (['created', 'processing', 'action_required'].includes(orderStatus)) return orderStatus;
  return 'manual_review';
}
