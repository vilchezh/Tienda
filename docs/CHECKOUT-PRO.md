# Checkout Pro con Orders API · entorno de prueba

La integración está implementada para usar exclusivamente la API de Orders de Mercado Pago (`POST /v1/orders`). No usa Preferences API, no lee credenciales productivas y no habilita pagos reales.

## Arquitectura

1. La ficha envía únicamente el ID del producto y los nombres de las opciones elegidas a `create-mp-order`.
2. La Edge Function vuelve a leer el producto activo y la configuración de checkout desde Supabase. Nunca acepta el total calculado por el navegador.
3. El servidor suma precio base, recargo de madera y extras; aplica la comisión editable y redondea hacia arriba al siguiente múltiplo de $1.000.
4. Se registra un pedido local y se crea la orden con `POST https://api.mercadopago.com/v1/orders`, `X-Idempotency-Key`, moneda `ARS` y el secreto `MP_ACCESS_TOKEN_TEST`.
5. Las rutas de retorno se envían en `config.online.success_url`, `failure_url` y `pending_url`. También se envía `config.online.callback_url` al webhook.
6. El webhook valida HMAC-SHA256 con `x-signature`, `x-request-id`, `data.id` y una tolerancia de cinco minutos. Después consulta `GET /v1/orders/{id}`: el payload del webhook y la URL de retorno nunca se toman como prueba de pago.
7. `/pago` muestra solamente el estado persistido después de esa verificación del servidor.

La firma admite `ts` de 10 dígitos (segundos) y 13 dígitos (milisegundos), manteniendo el valor original en el HMAC y rechazando desvíos superiores a cinco minutos. Los estados `refunded`, `partially_refunded` y `charged_back` prevalecen sobre cualquier pago anterior; `processed` solo se muestra como acreditado si el importe de `total_paid_amount` cubre el total esperado. Si Mercado Pago no informa un importe verificable, se exige revisión manual.

La creación y el webhook actualizan cada pedido mediante funciones SQL atómicas. La deduplicación se hace con una restricción única sobre `request_id` dentro de la misma transacción; los estados adversos no retroceden por una notificación demorada. Si la creación se interrumpe, repetir el mismo `client_request_id` después de dos minutos reintenta `POST /v1/orders` con el mismo `X-Idempotency-Key` y el importe guardado. Un operador puede volver a enviar la notificación Order para reconciliar estados antiguos; antes de activar ventas debe comprobar también la entrega/reintentos del webhook en Mercado Pago.

El endpoint de creación limita JSON a 4 KiB, valida tipos y opciones, y usa un cupo transaccional global de 60 intentos por minuto. CORS solo limita el uso desde navegadores: **no autentica solicitudes**. El cupo global protege el token de prueba, pero puede rechazar compradores legítimos durante picos; revisar un límite por identidad/IP confiable en el gateway antes de ventas reales.

La comisión actual es un **recargo sobre el subtotal**: `subtotal × (1 + porcentaje/100)`, seguido de redondeo hacia arriba a $1.000. Esto difiere del precio necesario para compensar una comisión descontada del cobro, `subtotal ÷ (1 − porcentaje/100)`. Por ejemplo, con $100.000 y 10%, el recargo da $110.000 y compensar un descuento de 10% exige $111.111,12 antes del redondeo. No se cambió el método vigente; revisar costos, impuestos y condiciones comerciales antes de usar credenciales productivas.

Referencias oficiales usadas:

- [Ejemplo Checkout Pro con Orders API del SDK oficial](https://github.com/mercadopago/sdk-nodejs/blob/master/src/examples/order/createCheckoutPro.ts)
- [Cliente oficial `POST /v1/orders`](https://github.com/mercadopago/sdk-nodejs/blob/master/src/clients/order/create/index.ts)
- [Tipos oficiales de respuesta Order, pagos, reembolsos y contracargos](https://github.com/mercadopago/sdk-nodejs/blob/master/src/clients/order/commonTypes.ts)
- [Validación oficial de firmas de webhook](https://github.com/mercadopago/sdk-nodejs/blob/master/docs/webhooks.md)

## Controles que fallan de forma segura

- `checkout_settings.payments_enabled` nace en `false`.
- `productos.checkout_habilitado` nace en `false` para todas las piezas.
- El backend busca solo `MP_ACCESS_TOKEN_TEST`; no existe una variable ni un camino para un token productivo.
- Una nota de modificación a medida deshabilita «Comprar ahora» y mantiene WhatsApp.
- Una opción oculta, eliminada o manipulada se rechaza al recalcular el pedido en el servidor.
- La URL recibida para redirigir se acepta únicamente si es HTTPS y pertenece a Mercado Pago.
- Los pedidos y eventos no tienen acceso anónimo; RLS usa `tienda_security.is_admin()` para administración.
- No se almacenan tarjetas, documentos ni el Access Token en tablas o frontend.

## Archivos de Supabase preparados

- `supabase/migrations/20261114040000_checkout_pro_orders.sql`: agrega el control por producto, configuración global, pedidos y deduplicación de webhooks. Incluye RLS y permisos explícitos.
- `supabase/functions/create-mp-order`: recalcula y crea la orden de prueba.
- `supabase/functions/mp-order-webhook`: valida la firma y consulta el estado real.
- `supabase/functions/get-mp-order-status`: expone al comprador un estado mínimo y sin datos personales.
- `supabase/config.toml`: marca las tres funciones como públicas en el gateway; cada una aplica sus propias validaciones.

La migración no fue aplicada y las funciones no fueron desplegadas durante este trabajo.

## Configuración requerida antes de probar remotamente

Para preparar un proyecto completamente independiente, seguir [la guía del sandbox](CHECKOUT-SANDBOX.md). La migración base y la semilla ficticia viven en `supabase/test/` y nunca se ejecutan con `supabase db push` sobre el proyecto publicado.

En **Supabase → Edge Functions → Secrets**, crear:

- `MP_ACCESS_TOKEN_TEST`: Access Token de prueba.
- `MP_WEBHOOK_SECRET_TEST`: firma secreta generada por Mercado Pago para el webhook de prueba.
- `STORE_BASE_URL`: `https://tienda-checkout-sandbox.acero-y-escamas.workers.dev` para el proyecto de prueba.
- `STORE_ALLOWED_ORIGINS`: opcional; previews adicionales separadas por coma.

No enviar ni guardar esos valores en GitHub. El archivo `.env.example` solo enumera los nombres.

En Mercado Pago, registrar la URL:

`https://pacyytbscnlklyrhsshp.supabase.co/functions/v1/mp-order-webhook`

y seleccionar eventos **Order**. La firma secreta mostrada por Mercado Pago debe guardarse como `MP_WEBHOOK_SECRET_TEST`.

Al cambiar a un dominio propio hay que actualizar dos lugares configurables:

- `STORE_PREVIEW_SITE_URL` para el build de vista previa (sin editar `assets/js/config.js` de producción).
- `STORE_BASE_URL` en Edge Function Secrets para los retornos de Mercado Pago y CORS.

## Orden de activación recomendado

1. Revisar la migración y aplicarla primero en una rama/entorno de Supabase de prueba.
2. Ejecutar las pruebas y los advisors de seguridad sobre ese entorno.
3. Configurar los secretos de prueba.
4. Desplegar las tres Edge Functions.
5. Registrar y probar el webhook Order.
6. En `/admin`, definir la comisión, autorizar productos concretos y recién entonces habilitar el interruptor global de prueba.
7. Probar aprobación, rechazo, pendiente, webhook duplicado, firma inválida y diferencias de importe.

Para pasar a credenciales reales se requiere una tarea y revisión separadas. Este código no contempla esa activación.
