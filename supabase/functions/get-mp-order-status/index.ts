import { statusHandler } from '../_shared/status-handler.mjs';

const env = Object.fromEntries([
  'STORE_BASE_URL',
  'STORE_ALLOWED_ORIGINS',
  'SUPABASE_URL',
  'SUPABASE_SECRET_KEYS',
  'SUPABASE_SERVICE_ROLE_KEY',
].map(key => [key, Deno.env.get(key) || '']));

Deno.serve(statusHandler(env));
