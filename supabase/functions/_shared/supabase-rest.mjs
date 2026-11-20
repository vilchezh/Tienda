import { CheckoutError } from './checkout-core.mjs';

export function serviceKey(env) {
  if (env.SUPABASE_SECRET_KEYS) {
    try {
      const keys = JSON.parse(env.SUPABASE_SECRET_KEYS);
      if (keys.default) return String(keys.default);
    } catch { /* fall through to the legacy key */ }
  }
  if (env.SUPABASE_SERVICE_ROLE_KEY) return String(env.SUPABASE_SERVICE_ROLE_KEY);
  throw new CheckoutError('Falta la clave interna de Supabase.', 500, 'server_configuration');
}

export function restHeaders(env, extra = {}) {
  const key = serviceKey(env);
  const headers = { apikey: key, 'Content-Type': 'application/json', ...extra };
  if (!key.startsWith('sb_secret_')) headers.Authorization = `Bearer ${key}`;
  return headers;
}

export async function supabaseRequest(env, fetchFn, path, init = {}) {
  const response = await fetchFn(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: restHeaders(env, init.headers || {}),
  });
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const error = new CheckoutError('No se pudo completar la operación interna.', 503, 'database_error');
    error.internalStatus = response.status;
    throw error;
  }
  return body;
}

export async function firstRow(env, fetchFn, path) {
  const rows = await supabaseRequest(env, fetchFn, path);
  return Array.isArray(rows) ? rows[0] || null : null;
}

export function encodeFilter(value) {
  return encodeURIComponent(String(value));
}
