import { resendDiagnosticHandler } from '../_shared/resend-diagnostic.mjs';
const names=['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SECRET_KEYS','SUPABASE_SERVICE_ROLE_KEY','RESEND_API_KEY','ORDER_EMAIL_FROM','ORDER_NOTIFICATION_TO','STORE_BASE_URL','STORE_DEPLOYMENT_MODE','STORE_EXPECTED_SUPABASE_REF','QUOTE_STORAGE_BUCKET'];
const env=Object.fromEntries(names.map(name=>[name,Deno.env.get(name)||'']));
Deno.serve(resendDiagnosticHandler(env));
