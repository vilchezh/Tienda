import { processCancellationNotificationsHandler } from '../_shared/cancellation-emails.mjs';
const keys=['SUPABASE_URL','SUPABASE_SECRET_KEYS','SUPABASE_SERVICE_ROLE_KEY','ORDER_NOTIFICATION_DISPATCH_SECRET','ORDER_NOTIFICATION_TO','ORDER_EMAIL_FROM','RESEND_API_KEY','CANCELLATION_SANDBOX_CUSTOMER_EMAIL','STORE_BASE_URL','STORE_DEPLOYMENT_MODE','STORE_EXPECTED_SUPABASE_REF'];
const env=Object.fromEntries(keys.map(key=>[key,Deno.env.get(key)||'']));
Deno.serve(processCancellationNotificationsHandler(env));
