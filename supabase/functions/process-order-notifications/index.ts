import { processNotificationsHandler } from '../_shared/process-notifications-handler.mjs';

const env = Object.fromEntries([
  'SUPABASE_URL',
  'SUPABASE_SECRET_KEYS',
  'SUPABASE_SERVICE_ROLE_KEY',
  'RESEND_API_KEY',
  'ORDER_EMAIL_FROM',
  'ORDER_NOTIFICATION_TO',
  'ORDER_NOTIFICATION_DISPATCH_SECRET',
].map(key => [key, Deno.env.get(key) || '']));
Deno.serve(processNotificationsHandler(env));
