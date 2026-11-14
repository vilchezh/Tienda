function parseSignature(value) {
  const result = { timestamp: '', hash: '' };
  for (const part of String(value || '').split(',')) {
    const [rawKey, ...rawValue] = part.split('=');
    const key = rawKey?.trim().toLowerCase();
    const item = rawValue.join('=').trim();
    if (key === 'ts') result.timestamp = item;
    if (key === 'v1') result.hash = item;
  }
  return result;
}

function constantTimeEqual(left, right) {
  const a = String(left || '').toLowerCase();
  const b = String(right || '').toLowerCase();
  let mismatch = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    mismatch |= (a.charCodeAt(index) || 0) ^ (b.charCodeAt(index) || 0);
  }
  return mismatch === 0;
}

async function hmacHex(secret, message) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(signature), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function signatureManifest(dataId, requestId, timestamp) {
  const parts = [];
  // Mercado Pago exige minúsculas cuando el identificador es alfanumérico.
  if (dataId) parts.push(`id:${String(dataId).toLowerCase()}`);
  if (requestId) parts.push(`request-id:${requestId}`);
  parts.push(`ts:${timestamp}`);
  return `${parts.join(';')};`;
}

export async function verifyMercadoPagoSignature({ signature, requestId, dataId, secret, now = Date.now(), toleranceSeconds = 300 }) {
  if (!secret || !signature || !requestId || !dataId) return false;
  const { timestamp, hash } = parseSignature(signature);
  if (!/^\d+$/.test(timestamp) || !/^[a-f0-9]{64}$/i.test(hash)) return false;
  const drift = Math.abs(now - Number(timestamp) * 1000) / 1000;
  if (!Number.isFinite(drift) || drift > toleranceSeconds) return false;
  const expected = await hmacHex(secret, signatureManifest(dataId, requestId, timestamp));
  return constantTimeEqual(expected, hash);
}
