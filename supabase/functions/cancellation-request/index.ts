import { cancellationRequestHandler } from '../_shared/cancellation-handler.mjs';
const names=['SUPABASE_URL','SUPABASE_SECRET_KEYS','SUPABASE_SERVICE_ROLE_KEY','STORE_BASE_URL','STORE_ALLOWED_ORIGINS','TURNSTILE_SECRET'];
const env=Object.fromEntries(names.map(name=>[name,Deno.env.get(name)||'']));
Deno.serve(cancellationRequestHandler(env));
