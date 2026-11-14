import { webhookHandler } from '../_shared/webhook-handler.mjs';

const env = Object.fromEntries([
  'MP_ACCESS_TOKEN_TEST',
  'MP_WEBHOOK_SECRET_TEST',
  'SUPABASE_URL',
  'SUPABASE_SECRET_KEYS',
  'SUPABASE_SERVICE_ROLE_KEY',
].map(key => [key, Deno.env.get(key) || '']));

Deno.serve(webhookHandler(env));
