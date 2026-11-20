import { normalizeBaseUrl } from './checkout-core.mjs';

export function allowedOrigins(env) {
  const values = [normalizeBaseUrl(env.STORE_BASE_URL)];
  for (const value of String(env.STORE_ALLOWED_ORIGINS || '').split(',')) {
    const trimmed = value.trim();
    if (trimmed) values.push(normalizeBaseUrl(trimmed));
  }
  return new Set(values.map(value => new URL(value).origin));
}

export function corsHeaders(request, env) {
  const origin = request.headers.get('origin') || '';
  if (!allowedOrigins(env).has(origin)) return null;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}
