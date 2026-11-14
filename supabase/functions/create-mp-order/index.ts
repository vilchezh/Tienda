import { createOrderHandler } from '../_shared/create-order-handler.mjs';

const env = Object.fromEntries([
  'MP_ACCESS_TOKEN_TEST',
  'STORE_BASE_URL',
  'STORE_ALLOWED_ORIGINS',
  'SUPABASE_URL',
  'SUPABASE_SECRET_KEYS',
  'SUPABASE_SERVICE_ROLE_KEY',
].map(key => [key, Deno.env.get(key) || '']));

Deno.serve(createOrderHandler(env));
