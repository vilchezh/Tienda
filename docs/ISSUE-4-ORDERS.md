# Issue #4 · Pedidos, compradores y correos (sandbox)

Esta etapa está preparada exclusivamente para `pacyytbscnlklyrhsshp` y el Worker `tienda-checkout-sandbox`. No se aplicó SQL, no se desplegaron funciones y no se hicieron pagos. Producción (`ivyagavbhsyzvikzhmhe` y Worker `tienda`) queda fuera del procedimiento.

## Qué agrega

- Sección **Pedidos** en `admin.html` con búsqueda, filtros, detalle de producto/configuración, contacto, entrega, importe, pago, correo y fabricación.
- Estados de fabricación independientes del pago: sin iniciar, confirmado, en fabricación, listo, entregado y cancelado.
- Notas internas y auditoría de cada cambio administrativo.
- Formulario previo al checkout con nombre, correo, teléfono opcional, retiro o envío, consentimiento y domicilio sólo cuando corresponde.
- Tabla privada separada para datos de compradores, RLS, privilegios mínimos y retención inicial de 365 días.
- Outbox de correo con clave única por pedido/tipo, reclamo transaccional, hasta 8 intentos, backoff y clave de idempotencia estable para Resend.
- Aviso inmediato después de un webhook acreditado y una función separada para reintentos programados.

Los dos pagos sandbox existentes seguirán visibles, pero mostrarán “No capturado en pedidos anteriores” porque se crearon antes de esta captura. No inventar ni completar esos datos a partir de Mercado Pago.

## Orden de activación pendiente

Todo lo siguiente requiere revisión y autorización explícita. Ejecutar únicamente contra `pacyytbscnlklyrhsshp`.

1. Aplicar `supabase/migrations/20261114204035_order_management.sql` después de la migración de checkout existente.
2. Ejecutar `supabase/test/03_assertions.sql` en una transacción que termina en `ROLLBACK` y revisar advisors de seguridad/performance.
3. Configurar los secretos de correo enumerados abajo.
4. Desplegar nuevamente `create-mp-order` y `mp-order-webhook`, porque ambas cambiaron.
5. Desplegar la nueva función `process-order-notifications`.
6. Publicar el frontend sólo en `tienda-checkout-sandbox`.
7. Probar con datos ficticios y reenvío de un webhook ya existente; no hace falta crear otro pago para validar deduplicación y panel.

No desplegar el frontend nuevo antes de la migración y de `create-mp-order`: el nuevo formulario exige que el backend pueda guardar contacto de forma atómica.

## Servicio de correo: Resend

Crear una cuenta/proyecto de sandbox en Resend, verificar un dominio o subdominio de envío y guardar estos valores únicamente en **Supabase → Edge Functions → Secrets** del proyecto sandbox:

- `RESEND_API_KEY`: API key limitada al envío desde el dominio sandbox.
- `ORDER_EMAIL_FROM`: remitente verificado, por ejemplo `Acero y Escamas <pedidos@sandbox.dominio.example>`.
- `ORDER_NOTIFICATION_TO`: buzón interno que recibirá cada nueva compra acreditada.
- `ORDER_NOTIFICATION_DISPATCH_SECRET`: valor aleatorio largo, diferente del secreto de Mercado Pago y de cualquier clave Supabase.

No poner estos valores en `assets/js/config.js`, GitHub, el repositorio ni capturas. `.env.example` contiene sólo nombres y ejemplos no funcionales.

Después de desplegar, crear una tarea HTTP en **Supabase Cron** que ejecute cada cinco minutos:

```text
POST https://pacyytbscnlklyrhsshp.supabase.co/functions/v1/process-order-notifications
x-dispatch-secret: <ORDER_NOTIFICATION_DISPATCH_SECRET>
```

Guardar el secreto en el mecanismo protegido de la tarea, no en SQL versionado. La función rechaza llamadas sin esa cabecera. El webhook intenta el envío inmediato; Cron procesa pendientes, fallidos y reclamos abandonados. Resend recibe una `Idempotency-Key` estable (`pedido + tipo`), y la base impide más de una fila por `pedido + tipo`.

## Seguridad y retención

- `anon` no tiene privilegios sobre compradores, auditoría ni outbox.
- `authenticated` sólo puede leer esas tablas cuando `tienda_security.is_admin()` devuelve verdadero.
- El panel sólo recibe permiso de columna para `manufacturing_status` e `internal_notes`; no puede modificar pago, importes ni IDs de Mercado Pago.
- `service_role` permanece dentro de Edge Functions y nunca se envía al navegador.
- La creación inserta pedido y contacto en una única transacción SQL.
- El plazo técnico inicial es 365 días. Antes de producción debe validarse legalmente y programarse `checkout_purge_expired_customer_data()`; la función borra contacto vencido y anonimiza destinatarios del log.
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
- La outbox limita reintentos a ocho. El panel muestra los fallos, pero todavía no incluye un botón manual de reenvío.
- No se cifran campos individualmente en aplicación; la protección depende de Supabase, TLS, RLS, control de administradores y las políticas de acceso del proyecto.
