# Issue #4 · Pedidos, compradores y correos (sandbox)

Esta etapa está preparada exclusivamente para `pacyytbscnlklyrhsshp` y el Worker `tienda-checkout-sandbox`. No se aplicó SQL, no se desplegaron funciones y no se hicieron pagos. Producción (`ivyagavbhsyzvikzhmhe` y Worker `tienda`) queda fuera del procedimiento.

## Qué agrega

- Sección **Pedidos** en `admin.html` con búsqueda, filtros, detalle de producto/configuración, contacto, entrega, importe, pago, correo y fabricación.
- Estados de fabricación independientes del pago: sin iniciar, confirmado, en fabricación, listo, entregado y cancelado.
- Notas internas y auditoría de cada cambio administrativo.
- Formulario previo al checkout con nombre, correo, teléfono opcional, retiro o envío, consentimiento y domicilio sólo cuando corresponde.
- Tabla privada separada para datos de compradores, RLS, privilegios mínimos y retención inicial de 365 días.
- Outbox de correo con clave única por pedido/tipo, reclamo transaccional, hasta 8 intentos, backoff y clave de idempotencia estable para Resend.
- Ventana local de idempotencia de 23 horas: una entrega de resultado incierto deja de reintentarse antes de que venza la protección de 24 horas de Resend y queda marcada `uncertain` para revisión.
- Aviso inmediato después de un webhook acreditado y una función separada para reintentos programados.

Los dos pagos sandbox existentes seguirán visibles, pero mostrarán “No capturado en pedidos anteriores” porque se crearon antes de esta captura. No inventar ni completar esos datos a partir de Mercado Pago.

## Orden de activación pendiente

Todo lo siguiente requiere revisión y autorización explícita. Ejecutar únicamente contra `pacyytbscnlklyrhsshp`.

1. Aplicar `supabase/migrations/20261114204035_order_management.sql` después de la migración de checkout existente.
2. Ejecutar `supabase/test/03_assertions.sql` en una transacción que termina en `ROLLBACK` y revisar advisors de seguridad/performance.
3. Configurar los secretos de correo enumerados abajo.
4. Desplegar nuevamente `create-mp-order` y `mp-order-webhook`, porque ambas cambiaron.
5. Desplegar las nuevas funciones `process-order-notifications` y `process-order-maintenance`.
6. Publicar el frontend sólo en `tienda-checkout-sandbox`.
7. Probar con datos ficticios y reenvío de un webhook ya existente; no hace falta crear otro pago para validar deduplicación y panel.

No desplegar el frontend nuevo antes de la migración y de `create-mp-order`: el nuevo formulario exige que el backend pueda guardar contacto de forma atómica.

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

## Mantenimiento programado de datos personales

La purga se expone únicamente mediante `process-order-maintenance`. Después de aplicar la migración, configurar `ORDER_MAINTENANCE_SECRET` en los secretos de Edge Functions del sandbox y desplegar esa función. Luego crear una tarea HTTP diaria en **Supabase Cron** a las **03:15 de Argentina** (`15 6 * * *` en UTC):

```text
POST https://pacyytbscnlklyrhsshp.supabase.co/functions/v1/process-order-maintenance
x-maintenance-secret: <ORDER_MAINTENANCE_SECRET>
```

Guardar el valor en Vault o en el almacén de secretos protegido del programador y construir la cabecera en tiempo de ejecución. No escribirlo en el comando SQL de Cron, logs ni archivos versionados. La función usa `service_role` sólo del lado servidor y llama exclusivamente a `checkout_purge_expired_customer_data()`. Verificar primero una ejecución manual contra datos ficticios vencidos y revisar el contador `purged`; esta preparación no crea ni ejecuta la tarea.

## Seguridad y retención

- `anon` no tiene privilegios sobre compradores, auditoría ni outbox.
- `authenticated` sólo puede leer esas tablas cuando `tienda_security.is_admin()` devuelve verdadero.
- El panel sólo recibe permiso de columna para `manufacturing_status` e `internal_notes`; no puede modificar pago, importes ni IDs de Mercado Pago.
- `service_role` permanece dentro de Edge Functions y nunca se envía al navegador.
- La creación inserta pedido y contacto en una única transacción SQL.
- El plazo técnico inicial es 365 días. Antes de producción debe validarse legalmente y activarse la tarea diaria documentada arriba; la función borra contacto vencido y anonimiza destinatarios del log.
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
- La entrega real de correos y la tarea Cron no pueden comprobarse hasta configurar Resend y desplegar en sandbox.
- La outbox limita reintentos a ocho y a 23 horas. Los estados `failed` y `uncertain` requieren revisión; el panel no incluye un botón manual de reenvío.
- No se cifran campos individualmente en aplicación; la protección depende de Supabase, TLS, RLS, control de administradores y las políticas de acceso del proyecto.
