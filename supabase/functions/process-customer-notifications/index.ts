import { customerNotificationSchedulerHandler } from '../_shared/customer-notification-scheduler.mjs';

const keys=[
 'SUPABASE_URL','SUPABASE_SECRET_KEYS','SUPABASE_SERVICE_ROLE_KEY',
 'STORE_BASE_URL','STORE_DEPLOYMENT_MODE','STORE_EXPECTED_SUPABASE_REF',
 'QUOTE_STORAGE_BUCKET','RESEND_API_KEY','ORDER_EMAIL_FROM','ORDER_NOTIFICATION_TO',
 'STORE_CUSTOMER_EMAILS_ENABLED'
];
const env=Object.fromEntries(keys.map(key=>[key,Deno.env.get(key)||'']));
Deno.serve(customerNotificationSchedulerHandler(env));
