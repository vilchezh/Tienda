import { CheckoutError } from './checkout-core.mjs';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[+()0-9 .-]+$/;

function requiredString(value, max, label, min = 1) {
  if (typeof value !== 'string') throw new CheckoutError(`${label} no es válido.`, 400, 'invalid_customer_data');
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length < min || normalized.length > max) {
    throw new CheckoutError(`${label} no es válido.`, 400, 'invalid_customer_data');
  }
  return normalized;
}

function optionalString(value, max, label) {
  if (value == null || value === '') return null;
  return requiredString(value, max, label);
}

export function normalizeCheckoutCustomer(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CheckoutError('Completá tus datos de contacto antes de continuar.', 400, 'invalid_customer_data');
  }
  const fullName = requiredString(value.full_name, 120, 'El nombre', 2);
  const email = requiredString(value.email, 254, 'El correo').toLowerCase();
  if (!EMAIL_PATTERN.test(email)) throw new CheckoutError('El correo no es válido.', 400, 'invalid_customer_data');

  const phone = optionalString(value.phone, 30, 'El teléfono');
  if (phone && (phone.length < 7 || !PHONE_PATTERN.test(phone))) {
    throw new CheckoutError('El teléfono no es válido.', 400, 'invalid_customer_data');
  }
  if (value.delivery_method !== 'pickup' && value.delivery_method !== 'delivery') {
    throw new CheckoutError('Elegí retiro o envío.', 400, 'invalid_customer_data');
  }
  if (value.privacy_accepted !== true) {
    throw new CheckoutError('Necesitamos tu aceptación del aviso de privacidad.', 400, 'privacy_required');
  }

  const delivery = value.delivery_method === 'delivery';
  return {
    full_name: fullName,
    email,
    phone,
    delivery_method: value.delivery_method,
    address_line: delivery ? requiredString(value.address_line, 180, 'El domicilio') : null,
    city: delivery ? requiredString(value.city, 100, 'La localidad') : null,
    province: delivery ? requiredString(value.province, 100, 'La provincia') : null,
    postal_code: delivery ? requiredString(value.postal_code, 20, 'El código postal') : null,
    delivery_notes: optionalString(value.delivery_notes, 500, 'Las indicaciones de entrega'),
    privacy_accepted: true,
  };
}
