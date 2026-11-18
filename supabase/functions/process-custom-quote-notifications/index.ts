import { quoteNotificationsHandler } from '../_shared/custom-quote-emails.mjs';
const names=['SUPABASE_URL','SUPABASE_SECRET_KEYS','SUPABASE_SERVICE_ROLE_KEY','ORDER_NOTIFICATION_DISPATCH_SECRET','ORDER_NOTIFICATION_TO','ORDER_EMAIL_FROM','RESEND_API_KEY','CUSTOM_QUOTE_SANDBOX_CUSTOMER_EMAIL','CANCELLATION_SANDBOX_CUSTOMER_EMAIL,'STORE_BASE_URL','STORE_DEPLOYMENT_MODE','STORE_EXPECTED_SUPABASE_REF','QUOTE_STORAGE_BUCKET'];
const env=Object.fromEntries(names.map(name=>[name,Deno.env.get(name)||'']));
Deno.serve(quoteNotificationsHandler(env));