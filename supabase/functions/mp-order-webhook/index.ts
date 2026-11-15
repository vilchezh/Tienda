import { webhookHandler } from '../_shared/webhook-handler.mjs';

const env = Object.fromEntries([
  'MP_ACCESS_TOKEN_TEST',
  'MP_WEBHOOK_SECRET_TEST',
  'SUPABASE_URL',
  'SUPABASE_SECRET_KEYS',
  'SUPABASE_SERVICE_ROLE_KEY',
  'RESEND_API_KEY',
  'ORDER_EMAIL_FROM',
  'ORDER_NOTIFICATION_TO',
  'STORE_BASE_URL',
].map(key => [key, Deno.env.get(key) || '']));

Deno.serve(webhookHandler(env));
