import { processMaintenanceHandler } from '../_shared/process-maintenance-handler.mjs';

const env = Object.fromEntries([
  'SUPABASE_URL',
  'SUPABASE_SECRET_KEYS',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ORDER_MAINTENANCE_SECRET',
  'STORE_BASE_URL',
  'STORE_DEPLOYMENT_MODE',
  'STORE_EXPECTED_SUPABASE_REF',
].map(key => [key, Deno.env.get(key) || '']));

Deno.serve(processMaintenanceHandler(env));
