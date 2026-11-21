# Fase 8 — Confirmaciones automáticas de presupuestos y arrepentimientos a clientes

Estado: **PREPARADO PARA REVISIÓN**. Este PR no ejecuta SQL ni publica funciones.

## Justificación
- El cron productivo `acero-y-escamas-seller-emails-10m` sólo envía al taller. Conserva este comportamiento, incluso con `STORE_CUSTOMER_EMAILS_ENABLED=true`.
- El dueño confirmó remitente `pedidos@aceroyescamas.com.ar` verificado en Resend y entrega de notificaciones al taller.
- Las cinco confirmaciones de pruebas previas quedaron en `rejected`, sin intentos y sin identificador Resend. **No reactivarlas**.
- El administrador configuró `STORE_CUSTOMER_EMAILS_ENABLED=true` en Secrets del proyecto original.

## Cambio propuesto
`process-customer-notifications` es una nueva Edge Function interna, sólo para producción, autorizada con el token secreto ya almacenado en Supabase Vault y validado mediante la RPC privada `storefront_validate_seller_dispatch`.
- No revela tokens, claves ni información de clientes.
- No permite HTTP GET, token ausente o inválido, sandbox ni entorno sin habilitación explícita.
- Usa los despachadores existentes (Resend, idempotencia y reclamación atómica en PostgreSQL).
- Limita el procesamiento a 2 trabajos de presupuesto y 2 de arrepentimiento por ejecución.
- Las RPC actuales `custom_quote_claim_emails` y `checkout_claim_cancellation_emails` pueden reclamar filas de `seller` o `customer` en el mismo proceso; no reenvían filas `sent`. El cron del taller sigue sin cambios.
- Reutiliza temporalmente el token de despacho de avisos al taller para evitar crear o exponer nuevos secretos. A futuro se puede separar la credencial del despachador de clientes.
- No toca `mp-order-webhook`, checkout ni pagos.

## Despliegue controlado (REQUIERE autorización expresa)
1. Verificar que el PR tenga CI correcto y fusionarlo en `main`, con permiso del dueño.
2. En Supabase original `ivyagavbhsyzvikzhmhe`, desplegar **únicamente** `process-customer-notifications`, con `verify_jwt=false` porque implementa su propia autenticación interna. Incluir todos los archivos relativos importados y `assets/js/pricing.js`. No desplegar en sandbox.
3. Comprobar que el endpoint rechaza GET, POST sin token y que las 5 filas antiguas permanecen `rejected`. Antes del cron, comprobar la variable `STORE_CUSTOMER_EMAILS_ENABLED=true` por medio de una invocación autorizada sin trabajo pendiente; la conexión API puede no permitir leer el secreto directamente.
4. En **Supabase producción** y únicamente con autorización del dueño, instalar el siguiente cron:

```sql
SELECT cron.schedule(
  'acero-y-escamas-customer-emails-5m',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://ivyagavbhsyzvikzhmhe.supabase.co/functions/v1/process-customer-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-seller-dispatch-token',
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='storefront-seller-dispatch-token')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  ) AS request_id;
  $$
);
```

5. Verificar `cron.job` y `cron.job_run_details`. Hacer una nueva prueba de un presupuesto y de un arrepentimiento con correos propios y comprobar registros `provider_message_id` y `delivered` en Resend. Esperar hasta la siguiente ventana de 5 minutos.
6. Verificar que los avisos al taller siguen operativos y que los anteriores rechazados no se envían.

## Reversión
Detener solamente el cron nuevo:
```sql
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname='acero-y-escamas-customer-emails-5m'),
  active := false
);
```
Después, cambiar `STORE_CUSTOMER_EMAILS_ENABLED=false` en Secrets. El cron del vendedor y los datos se conservan. No borrar solicitudes.

## Precauciones
El sitio es público incluso si no está publicitado; nuevos visitantes reales podrían completar formularios. Antes de habilitar el cron, confirmar que `ORDER_EMAIL_FROM` sigue verificado, que el volumen permitido por Resend es suficiente y que los correos de prueba antiguos están cancelados. No se necesita modificar DNS, Mercado Pago o Workers.
