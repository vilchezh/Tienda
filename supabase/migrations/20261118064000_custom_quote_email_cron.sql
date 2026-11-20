-- Sólo proyecto pacyytbscnlklyrhsshp. Reutiliza la autenticación Vault de cron ya existente.
do $$
begin
 if not exists(select 1 from cron.job where jobname='checkout-sandbox-custom-quote-notifications') then
  perform cron.schedule('checkout-sandbox-custom-quote-notifications','*/5 * * * *',$job$
   select net.http_post(
    url := 'https://pacyytbscnlklyrhsshp.supabase.co/functions/v1/process-custom-quote-notifications',
    headers := jsonb_build_object('Content-Type','application/json',
     'x-dispatch-secret',(select decrypted_secret from vault.decrypted_secrets
      where name='order_notification_dispatch_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 10000
   );
  $job$);
 end if;
end $$;