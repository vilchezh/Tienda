import { customQuoteHandler } from '../_shared/custom-quote-handler.mjs';
const keys=['SUPABASE_URL','SUPABASE_SECRET_KEYS','SUPABASE_SERVICE_ROLE_KEY','STORE_BASE_URL','STORE_ALLOWED_ORIGINS','TURNSTILE_SECRET'];
const env=Object.fromEntries(keys.map(key=>[key,Deno.env.get(key)||'']));
Deno.serve(customQuoteHandler(env));
