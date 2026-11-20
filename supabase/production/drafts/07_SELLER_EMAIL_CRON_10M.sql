-- Programación productiva de solo avisos al taller cada 10 minutos.
-- No se incluye clave literal: pg_cron obtiene el token privado desde Vault.
-- No ejecuta las colas de clientes ni los avisos de pedidos de pago.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

SELECT cron.schedule(
 'acero-y-escamas-seller-emails-10m',
 '*/10 * * * *',
 $task$
 SELECT net.http_post(
  url := 'https://ivyagavbhsyzvikzhmhe.supabase.co/functions/v1/process-seller-notifications',
  headers := jsonb_build_object(
   'Content-Type','application/json',
   'x-seller-dispatch-token',
   (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='storefront-seller-dispatch-token')
  ),
  body := '{}'::jsonb,
  timeout_milliseconds := 20000
 ) AS request_id;
 $task$
);
