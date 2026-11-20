# Issue #4 · Pedidos, compradores y correos (sandbox)

Esta etapa se desarrolla exclusivamente en `pacyytbscnlklyrhsshp` y el Worker `tienda-checkout-sandbox`. Producción (`ivyagavbhsyzvikzhmhe` y Worker `tienda`) queda fuera del procedimiento.

## Estado comprobado el 17/11/2026

- Las migraciones iniciales del Issue #4 ya se aplicaron en sandbox; **no repetirlas**. La mejora de paginación está registrada allí como `20261116173004_improve_order_attempts_admin`.
- Están desplegadas cinco funciones de checkout, hay 15 pedidos históricos de prueba y 6 avisos en outbox. El webhook y ambos correos se probaron en una compra ficticia.
- `payments_enabled=false`. La pantalla `/pago` del Issue #3 ya se publicó sólo en sandbox.
- Cron de notificaciones activo cada cinco minutos (`checkout-sandbox-order-notifications`). Cron de mantenimiento y anonimización activo a las 03:15 de Argentina (`checkout-sandbox-order-maintenance`, job 3; `15 6 * * *` UTC). La primera ejecución programada será el 18/11/2026.
- La migración `20261117210000_harden_checkout_privileges.sql` ya se aplicó en Supabase sandbox como `20261117231753_harden_checkout_privileges_20261117210000`. Verificado que `anon` y `authenticated` no tienen `TRUNCATE`, `TRIGGER`, `REFERENCES` ni `MAINTAIN` sobre `checkout_orders` y `checkout_settings`; conservaron lectura y edición de fabricación/notas donde corresponde.
- Este archivo conserva los procedimientos originales de instalación para referencia histórica. Revisar las verificaciones de estado antes de repetir cualquier operación.



## Qué agrega

- Sección **Pedidos** en `admin.html` con búsqueda, filtros, detalle de producto/configuración, contacto, entrega, importe, pago, correo y fabricación.
- Estados de fabricación independientes del pago: sin iniciar, confirmado, en fabricación, listo, entregado y cancelado.
- Notas internas y auditoría de cada cambio administrativo.
- Formulario previo al checkout con nombre, correo, teléfono opcional, retiro o envío, consentimiento y domicilio sólo cuando corresponde.
- Tabla privada separada para datos de compradores, RLS, privilegios mínimos y retención inicial de 365 días.
- Outbox de correo con clave única por pedido/tipo, reclamo transaccional, hasta 8 intentos, backoff y clave de idempotencia estable para Resend.
- Ventana local de idempotencia de 23 horas: una entrega de resultado incierto deja de reintentarse antes de que venza la protección de 24 horas de Resend y queda marcada `uncertain` para revisión.
- Aviso inmediato después de un webhook acreditado y una función separada para reintentos programados.
- Recuperación del intento de checkout durante 24 horas en la misma pestaña: recargas, errores de red y retornos pendientes reutilizan `client_request_id`; una configuración distinta o un pago terminal permiten un intento nuevo.
- Listado administrativo paginado de 50 filas con total, búsqueda, orden, mes/rango en `America/Argentina/Buenos_Aires` y filtros comerciales para separar ventas acreditadas de intentos sin pago.

Los pedidos antiguos sin datos de contacto siguen visibles con “No capturado en pedidos anteriores”, ya que se registraron antes de la captura de compradores. No inventar ni completar esos datos a partir de Mercado Pago.

## Procedimiento de instalación original (histórico: NO repetir en sandbox)

Todo lo siguiente requiere revisión y autorización explícita. Ejecutar únicamente contra `pacyytbscnlklyrhsshp`.

1. Aplicar `supabase/migrations/20261114204035_order_management.sql` después de la migración de checkout existente y luego `supabase/migrations/20261115174702_improve_order_attempts_admin.sql`. Si la primera ya está aplicada, ejecutar sólo la segunda.
2. Ejecutar `supabase/test/03_assertions.sql` en una transacción que termina en `ROLLBACK` y revisar advisors de seguridad/performance.
3. Configurar los secretos de correo enumerados abajo.
4. Desplegar nuevamente `create-mp-order`, `mp-order-webhook` y `get-mp-order-status`, porque sus manejadores cambiaron.
5. Desplegar las nuevas funciones `process-order-notifications` y `process-order-maintenance`.
6. Publicar el frontend sólo en `tienda-checkout-sandbox`.
7. Probar con datos ficticios y reenvío de un webhook ya existente; no hace falta crear otro pago para validar deduplicación y panel.

No desplegar el frontend nuevo antes de la migración y de `create-mp-order`: el nuevo formulario exige que el backend pueda guardar contacto de forma atómica.

### Comprobar migraciones antes de ejecutar SQL

En **SQL Editor** del proyecto `pacyytbscnlklyrhsshp`, ejecutar primero esta consulta de solo lectura. El historial `supabase_migrations.schema_migrations` sólo es fiable si las migraciones se aplicaron mediante CLI; una ejecución manual desde SQL Editor puede no figurar allí.

```sql
select
  to_regclass('public.checkout_orders') is not null as checkout_base,
  to_regclass('public.checkout_order_customers') is not null as buyers_table,
  to_regclass('public.checkout_order_events') is not null as audit_table,
  to_regclass('public.checkout_email_outbox') is not null as email_outbox,
  to_regprocedure('public.checkout_create_order(uuid,text,jsonb,jsonb,bigint,numeric,bigint,jsonb)') is not null as atomic_order_creation,
  to_regprocedure('public.checkout_admin_list_orders(text,text,text,text,timestamptz,timestamptz,text,integer,integer)') is not null as paginated_admin_list,
  exists (select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'checkout_settings'
            and column_name = 'personal_data_retention_days') as retention_setting,
  exists (select 1 from pg_constraint
          where conrelid = to_regclass('public.checkout_email_outbox')
            and conname = 'checkout_email_outbox_status_check'
            and pg_get_constraintdef(oid) like '%rejected%') as permanent_rejection_status;
```

`checkout_base` debe ser verdadero antes de aplicar cualquiera de las dos migraciones del Issue #4. Si sólo `checkout_base` es verdadero, aplicar **20261114204035** y luego **20261115174702**. Si las tablas de compradores, auditoría y outbox, la creación atómica y el ajuste de retención ya existen, aplicar sólo **20261115174702** cuando falte `paginated_admin_list` o `permanent_rejection_status`. Si todos los indicadores son verdaderos, no ejecutar ninguna. Una mezcla incompleta exige inspección manual antes de aplicar archivos completos: la primera migración crea políticas con nombres fijos y no está diseñada para repetirse. Al finalizar, ejecutar `03_assertions.sql` con `ROLLBACK` y comprobar también las dos órdenes históricas por ID y estado; no modificar sus importes ni vincular compradores ficticios.

## Servicio de correo: Resend

Crear una cuenta/proyecto de sandbox en Resend, verificar un dominio o subdominio de envío y guardar estos valores únicamente en **Supabase → Edge Functions → Secrets** del proyecto sandbox:

- `RESEND_API_KEY`: API key limitada al envío desde el dominio sandbox.
- `ORDER_EMAIL_FROM`: remitente verificado, por ejemplo `Acero y Escamas <pedidos@sandbox.dominio.example>`.
- `ORDER_NOTIFICATION_TO`: buzón interno que recibirá cada nueva compra acreditada.
- `ORDER_NOTIFICATION_DISPATCH_SECRET`: valor aleatorio largo, diferente del secreto de Mercado Pago y de cualquier clave Supabase.
- `ORDER_MAINTENANCE_SECRET`: otro valor aleatorio largo e independiente, usado sólo por la purga de datos vencidos.

No poner estos valores en `assets/js/config.js`, GitHub, el repositorio ni capturas. `supabase/functions/.env.example` contiene sólo nombres y ejemplos no funcionales.

Después de desplegar, crear una tarea HTTP en **Supabase Cron** que ejecute cada cinco minutos:

```text
POST https://pacyytbscnlklyrhsshp.supabase.co/functions/v1/process-order-notifications
x-dispatch-secret: <ORDER_NOTIFICATION_DISPATCH_SECRET>
```

Guardar el secreto en el mecanismo protegido de la tarea, no en SQL versionado. La función rechaza llamadas sin esa cabecera. El webhook intenta el envío inmediato; Cron procesa pendientes, fallidos y reclamos abandonados. Resend recibe una `Idempotency-Key` estable (`pedido + tipo`), y la base impide más de una fila por `pedido + tipo`.

Resend conserva una clave de idempotencia durante 24 horas. El primer reclamo fija un vencimiento local a 23 horas. Si Resend aceptó el correo pero falló la confirmación en Supabase, la fila queda `processing`: sólo se reclama con la misma clave dentro de esa ventana. Al vencer, `checkout_expire_uncertain_notifications()` la mueve a `uncertain`; no hay reenvío automático posterior que pueda duplicar el mensaje.

Un `403` de Resend es permanente, no transitorio: la outbox lo guarda como `rejected` con el código seguro `provider_forbidden` y no lo vuelve a reclamar. Según la documentación vigente de Resend, las causas habituales son usar `resend.dev` para enviar a un destinatario distinto del correo propietario de la cuenta o usar un `from` cuyo dominio todavía no está verificado. Si el correo al comprador fue enviado pero el del vendedor recibió `403`, comprobar primero que `ORDER_NOTIFICATION_TO` sea el destinatario autorizado durante pruebas; para enviar a cualquier buzón, verificar un dominio y cambiar `ORDER_EMAIL_FROM` a ese dominio. El panel muestra este diagnóstico sin guardar la respuesta completa del proveedor ni datos personales en logs.

Antes de cada reintento, el despachador comprueba que el pedido siga en `payment_status=processed`. Si hubo reembolso, contracargo o revisión, marca el aviso pendiente como `rejected` con `payment_no_longer_accredited` y no envía una nueva confirmación. Un correo ya aceptado por Resend no se puede retirar; revisar esos casos en el panel.

## Intentos de checkout y conciliación

El navegador guarda en `sessionStorage` únicamente UUID, fecha, producto y una huella SHA-256 del formulario; no conserva nombre, correo, teléfono ni domicilio en claro. El mismo intento se recupera después de recargar, volver desde Mercado Pago con estado pendiente o reintentar una falla de red. Cambiar producto/configuración/contacto produce una huella distinta y, por diseño, un nuevo intento. Un estado terminal verificado libera el intento para permitir una compra legítima idéntica posterior.

Las órdenes `created`, `failed` o `canceled` aparecen en **Intentos sin pago** y no cuentan como ventas. No se fusionan ni eliminan por email, producto o importe. Para órdenes históricas `created`, corresponde conciliar por `mp_order_id` contra Orders API o el panel de Mercado Pago antes de cualquier decisión; esta etapa no hace una conciliación masiva automática porque no debe inferir acreditaciones ni modificar pagos existentes sin revisión y autorización.

## Mantenimiento programado de datos personales

La purga se expone únicamente mediante `process-order-maintenance`. **Ya está desplegada y programada en sandbox** mediante Supabase Cron, todos los días a las **03:15 de Argentina** (`15 6 * * *` UTC). No volver a crear la tarea si ya existe. Configuración realizada: job 3, nombre `checkout-sandbox-order-maintenance`, con secreto almacenado en Vault.

```text
POST https://pacyytbscnlklyrhsshp.supabase.co/functions/v1/process-order-maintenance
x-maintenance-secret: <ORDER_MAINTENANCE_SECRET>
```

Guardar el valor en Vault o en el almacén de secretos protegido del programador y construir la cabecera en tiempo de ejecución. No escribirlo en el comando SQL de Cron, logs ni archivos versionados. La función usa `service_role` sólo del lado servidor y llama exclusivamente a `checkout_purge_expired_customer_data()`. Se probó con dos compradores ficticios dentro de una transacción `ROLLBACK`: el caducado se eliminó, el destinatario del correo se anonimizó, el activo y ambos pedidos se conservaron. Se comprobó también idempotencia (`purged=0` en una segunda llamada). La Edge Function respondió **HTTP 200** con secreto Vault y `purged=0` contra datos vigentes; sin secreto respondió **HTTP 401**. Las pruebas sintéticas están versionadas en `supabase/test/04_retention.sql`. Ningún cliente real fue eliminado durante la validación.

### Revisión pendiente de permisos y datos

La migración `supabase/migrations/20261117210000_harden_checkout_privileges.sql` ya se aplicó con autorización al sandbox y se verificó su resultado. No repetirla. La protección de privilegios estructurales se añade a RLS; RLS por sí solo no protege `TRUNCATE`.

No se habilitan ni implementan reembolsos automáticos desde el panel. Los estados `refunded`, `partially_refunded` y `charged_back` siguen llegando de Mercado Pago por webhook verificado; ejecutar una devolución de dinero es una operación distinta.

El Cron de purga `checkout-sandbox-order-maintenance` está **activo**. Se comprobó que el comando referencia Vault por nombre y nunca almacena el valor del secreto en SQL versionado. Después de la primera ejecución programada (18/11/2026, 03:15 Argentina) revisar `cron.job_run_details` y la respuesta HTTP. Retención actual: 365 días; al 17/11/2026 no hay contactos vencidos y el primer vencimiento es en noviembre de 2027.

## Seguridad y retención

- `anon` no tiene privilegios sobre compradores, auditoría ni outbox.
- `authenticated` sólo puede leer esas tablas cuando `tienda_security.is_admin()` devuelve verdadero.
- El panel sólo recibe permiso de columna para `manufacturing_status` e `internal_notes`; no puede modificar pago, importes ni IDs de Mercado Pago.
- `service_role` permanece dentro de Edge Functions y nunca se envía al navegador.
- La creación inserta pedido y contacto en una única transacción SQL.
- El plazo técnico inicial es 365 días. La tarea diaria **está activa sólo en sandbox**; antes de producción debe validarse legalmente el período y configurar una tarea independiente en producción con autorización explícita. La función borra contactos vencidos y anonimiza destinatarios del log.
- Las notas internas no deben usarse para copiar documentos, datos de tarjeta ni información sensible adicional.

## Comprobaciones posteriores a una activación autorizada

- Una cuenta autenticada que no esté en `tienda_security.admins` no puede leer pedidos ni compradores.
- Un administrador puede cambiar fabricación/notas, pero un `PATCH` de `payment_status` falla.
- Un pedido nuevo de retiro no guarda domicilio; uno de envío exige todos los campos mínimos.
- Un webhook acreditado crea exactamente dos filas de outbox (cliente y vendedor).
- Reenviar el mismo `x-request-id` no crea eventos ni correos adicionales.
- Reintentar una entrega usa la misma clave de idempotencia de Resend.
- Los dos pedidos históricos mantienen su acreditación y no generan correos retroactivos.

## Riesgos pendientes antes de producción

- El texto de privacidad y el plazo de 365 días necesitan revisión legal/comercial.
- Deben verificarse SPF, DKIM y DMARC del dominio remitente; sin eso los correos pueden ir a spam.
- En sandbox se probaron los correos a comprador y vendedor y sus diseños responsive. La Edge Function de mantenimiento respondió 200/401 según la autenticación y el Cron está activo; **falta comprobar el primer disparo programado**. Antes de producción, verificar un dominio propio en Resend para envíos a destinatarios reales.
- La outbox limita reintentos a ocho y a 23 horas. Los estados `failed` y `uncertain` requieren revisión; el panel no incluye un botón manual de reenvío.
- No se cifran campos individualmente en aplicación; la protección depende de Supabase, TLS, RLS, control de administradores y las políticas de acceso del proyecto.
