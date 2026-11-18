-- Cron de notificaciones de arrepentimiento. Solo sandbox.
-- Reutiliza el secreto de despacho que ya está guardado en Vault para el Cron de pedidos.
do $$
begin
 if not exists (select 1 from cron.job where jobname='checkout-sandbox-cancellation-notifications') then
  perform cron.schedule('checkout-sandbox-cancellation-notifications','*/5 * * * *',$job$
   select net.http_post(
     url := 'https://pacyytbscnlklyrhsshp.supabase.co/functions/v1/process-cancellation-notifications',
     headers := jsonb_build_object(
       'Content-Type','application/json',
       'x-dispatch-secret',(
         select decrypted_secret from vault.decrypted_secrets
         where name='order_notification_dispatch_secret'
       )
     ),
     body := '{}'::jsonb,
     timeout_milliseconds := 10000
   );
  $job$);
 end if;
end $$;
