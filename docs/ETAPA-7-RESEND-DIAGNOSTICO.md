# Etapa 7 — Resend: diagnóstico seguro y separación de notificaciones

Fecha: 19/11/2026. **Solo pruebas del propietario**; todavía no hay compradores reales ni flujos comerciales habilitados en ninguno de los dos proyectos.

## Preparación realizada

- El remitente temporal `Acero y Escamas <onboarding@resend.dev>` **no** permite enviar correos a clientes arbitrarios. Resend limita las pruebas a la dirección verificada de la cuenta. No comprar dominio ni activar pagos para resolver este diagnóstico.
- Se añadió `customerEmailsEnabled(env)` en `supabase/functions/_shared/deployment-config.mjs`. **En producción, por defecto es falso**, y también es falso aunque alguien marque la habilitación con remitente `@resend.dev`.
- Para habilitar futuros mensajes a clientes reales habrá que verificar un dominio del remitente en Resend, cambiar `ORDER_EMAIL_FROM` al remitente del dominio y configurar explícitamente `STORE_CUSTOMER_EMAILS_ENABLED=true` en Edge Function Secrets. El dominio debe comprobarse en el panel del proveedor: la variable sola no acredita la verificación.
- Las colas de presupuestos y arrepentimientos tienen ahora funciones privadas `custom_quote_claim_seller_emails` y `checkout_claim_cancellation_seller_emails`, que reclaman solamente avisos al taller cuando la entrega al cliente está deshabilitada; **los correos al cliente quedan pending y no consumen intentos**.
- El procesador de pedidos de Mercado Pago no dispara correos mientras falte la habilitación real. El checkout continúa desactivado.
- El nuevo endpoint `resend-diagnostic` exige un JWT de sesión administrativa validado mediante `storefront_admin_authorized`, valida el origen del Worker y reserva **como máximo un intento cada 15 minutos por proyecto** mediante `email_diagnostic_reserve`.
- La prueba tiene destinatario fijo `ORDER_NOTIFICATION_TO`; no acepta un destinatario del navegador. Su contenido no incluye compras, contactos ni datos de solicitudes, y marca el mensaje como prueba interna.
- En `admin.html` → **Pedidos** se agregó **«Comprobar correos de Resend (solo pruebas)»** con botón **«Enviar correo de prueba al taller»**.
- `supabase/production/drafts/04_EMAIL_SELLER_CLAIMS.sql` y `05_RESEND_DIAGNOSTIC_RATE_LIMIT.sql` se aplicaron a las dos bases. Nuevas RPC únicamente ejecutables por `service_role`; permisos `anon` denegados y RLS en tabla de limitación.

## Verificaciones efectuadas

- Pruebas unitarias con mocks y autorización fallida, origen ajeno, destinatario inalterable, proveedor HTTP 403 y limitación: [GitHub Actions](https://github.com/vilchezh/Tienda/actions/runs/44644829598) **success**.
- Pruebas HTTP negativas del endpoint real de producción: [GitHub Actions](https://github.com/vilchezh/Tienda/actions/runs/44645142886) **success**; no se hicieron envíos.
- Las cuatro Edge Functions `process-custom-quote-notifications`, `process-cancellation-notifications`, `process-order-notifications`, `resend-diagnostic` están **ACTIVE** tras desplegarse en ambas organizaciones. El sandbox y el Supabase original tienen secretos propios.
- Las seis notificaciones de prueba anteriores siguen pendientes de revisión; **no se programó Cron ni se llamó a los procesadores de envío**.

## Validación real pendiente

El propietario debe ingresar con su sesión administrativa a `https://tienda.acero-y-escamas.workers.dev/admin`, abrir **Pedidos → Comprobar correos de Resend (solo pruebas)** y pulsar el botón **una sola vez**. La tienda mostrará si Resend **aceptó** el correo o lo rechazó. La aceptación no prueba la recepción: revisar inbox/spam de `ORDER_NOTIFICATION_TO`.

Si aparece un error `403`, confirmar en el panel de Resend que `ORDER_NOTIFICATION_TO` es la misma dirección con la que se creó la cuenta mientras se use `onboarding@resend.dev`. La API Key o secretos nunca deben compartirse por chat o GitHub.

Después de una prueba exitosa se puede planificar un programador seguro solo de avisos al taller, con secreto Vault y sin enviar a compradores. **No activar Cron todavía.**

Fuentes: https://resend.com/docs/knowledge-base/what-does-this-error-mean y https://resend.com/changelog/sending-test-emails

## Estado de publicación y comprobaciones posteriores

- El frontend con el botón de diagnóstico fue publicado mediante [GitHub Actions 44645326930](https://github.com/vilchezh/Tienda/actions/runs/44645326930), con resultado **success** y verificación HTTP postdeploy completada.
- Cloudflare Worker `tienda`: versión `f31e34e2-c676-4411-b292-61bd5501ad1d`.
- La publicación sandbox del frontend fue omitida expresamente; **sí** se actualizaron las Edge Functions internas del Supabase sandbox con versiones seguras equivalentes.
- Se detectó que el webhook `mp-order-webhook` también importa el envío inmediato de pedidos. Se añadió `STORE_CUSTOMER_EMAILS_ENABLED` a su entorno, se empacó con `email-notifications.mjs` protegido y se publicó **sandbox v21 y producción v2**. No se habilitaron cobros.
- SQL posterior (producción): `payments_enabled=false`, cero productos con checkout, cero pedidos, 2 correos de presupuestos y 4 de arrepentimientos pendientes, cero intentos de diagnóstico. En sandbox: pagos también apagados; pedidos y productos de pruebas existentes permanecen.
- No se procesó ninguna cola, no se envió correo alguno y no se activó programación automática. La única prueba positiva de correo todavía requiere un clic administrativo en la tienda y revisar la recepción.

**Precaución:** `resend-diagnostic` responde `accepted_by_resend` cuando el proveedor acepta el envío, pero eso no garantiza entregabilidad. La recepción debe confirmarse en la casilla indicada como `ORDER_NOTIFICATION_TO`. Si la respuesta es `sender_or_recipient_not_verified`, revisar que corresponda a la casilla de la cuenta Resend y que siga configurado `onboarding@resend.dev`.


## Automatización interna activada — solo avisos al taller

Tras la prueba Resend con ID de proveedor `01a1f6ea-d20c-7abf-9ee2-3fc54d7d1126`, el propietario confirmó que el correo fue recibido efectivamente en su Gmail de taller.

- Se normalizó a minúsculas el destinatario vendedor en `custom-quote-emails.mjs` y `cancellation-emails.mjs` para igualar la entrega positiva del diagnóstico.
- Nueva función `process-seller-notifications` desplegada en Supabase original y sandbox. **Rechaza sandbox**, rechaza faltantes y claves inválidas, comprueba con `storefront_validate_seller_dispatch` (RPC solo `service_role`) una clave aleatoria de 32 bytes generada y almacenada exclusivamente en Supabase Vault del proyecto original. No hay tokens privados en código ni en el comando Cron.
- Incluso si más adelante se habilitan correos a clientes, la función fuerza `STORE_CUSTOMER_EMAILS_ENABLED` vacío y reclama únicamente por las RPC `custom_quote_claim_seller_emails` y `checkout_claim_cancellation_seller_emails`.
- Se activaron `pg_cron` y `pg_net` exclusivamente en Supabase original (no se modificó el calendario de sandbox). Cron `acero-y-escamas-seller-emails-10m`, job ID **1**, cron `*/10 * * * *`, activo. Consulta el token dentro de `vault.decrypted_secrets` al ejecutar y llama mediante `net.http_post` al endpoint nuevo. Máximo **un aviso de presupuesto y uno de arrepentimiento por ejecución**, cada 10 minutos.
- [Pruebas unitarias del programador](https://github.com/vilchezh/Tienda/actions/runs/44666191351): **success**. [Pruebas HTTP negativas en Supabase productivo](https://github.com/vilchezh/Tienda/actions/runs/44666390899): **success**. No se envió ningún correo durante estas pruebas negativas.
- Se disparó una ejecución de prueba desde SQL, sin exponer el token: respuesta `net._http_response.id=1` con **HTTP 200** `ok:true,seller_only:true`; `quotes: processed 1, sent 1`; `cancellations: processed 1, sent 1`. **Resend aceptó esos dos mensajes**, pero su recepción Gmail posterior aún no fue comprobada por el propietario.
- Comprobación SQL posterior: 1 aviso de presupuesto al taller enviado, 1 aviso de arrepentimiento al taller enviado, 1 aviso de arrepentimiento al taller pendiente para el próximo Cron. **Los 3 emails de clientes permanecen pending** (1 presupuesto, 2 arrepentimientos); `payments_enabled=false`, 0 productos con checkout y 0 pedidos. `main` no se fusionó.
- Para detener la automatización: `SELECT cron.alter_job(job_id := (SELECT jobid FROM cron.job WHERE jobname='acero-y-escamas-seller-emails-10m'), active := false);`. Para inspección: `SELECT jobid,jobname,schedule,active FROM cron.job WHERE jobname='acero-y-escamas-seller-emails-10m';`
- No se configuraron correos comerciales a clientes ni pago de Resend. El envío general a clientes requiere dominio verificado, comprobar entregabilidad y autorización expresa.
