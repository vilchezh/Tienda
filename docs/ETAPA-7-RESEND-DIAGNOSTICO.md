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
