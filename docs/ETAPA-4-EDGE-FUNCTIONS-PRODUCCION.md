# Etapa 4 — Edge Functions de producción · revisión 19/11/2026

**Estado: PREPARACIÓN EN PR #2. SIN DESPLIEGUE a Supabase producción.**
Proyecto original: `ivyagavbhsyzvikzhmhe`. Sandbox separado: `pacyytbscnlklyrhsshp`.
Worker público original: `https://tienda.acero-y-escamas.workers.dev` (valor observado en `assets/js/config.js`; validar la URL efectiva antes de configurar).
No modificar `main`, Worker `tienda` ni activar pagos hasta autorización específica.

## Inventario confirmado en Supabase

- Sandbox: **10 funciones activas**.
- Producción: **0 funciones** antes de iniciar esta preparación.
- **9 funciones** a revisar para una futura instalación productiva:
  1. `create-mp-order` — crear orden de Checkout Pro, sujeto al flag SQL de pagos.
  2. `get-mp-order-status` — consultar estado verificado del pedido sin acreditar por URL.
  3. `mp-order-webhook` — recibir y verificar firma de Mercado Pago (LIVE distinto de TEST).
  4. `process-order-notifications` — enviar reintentos de correos de pedidos.
  5. `process-order-maintenance` — limpieza de datos vencidos, sin Cron productivo todavía.
  6. `cancellation-request` — registrar y consultar arrepentimientos.
  7. `process-cancellation-notifications` — correos sobre arrepentimientos.
  8. `custom-quote-request` — registrar y procesar referencias de presupuestos privados.
  9. `process-custom-quote-notifications` — avisos sobre presupuestos.
- **Excluir `mp-order-diagnostic-test`**, herramienta de diagnóstico exclusiva del sandbox.

## Error detectado y corregido en el código

El validador `deploymentConfig()` requiere `QUOTE_STORAGE_BUCKET` en modo producción, incluso en funciones ajenas a presupuestos. Siete puntos de entrada no transmitían esa variable desde `Deno.env`, por lo que fallarían con `production_configuration_incomplete`.

Se agregó `QUOTE_STORAGE_BUCKET` en las siete `index.ts` afectadas. `custom-quote-request` y `process-custom-quote-notifications` ya la transmitían. Se añadió prueba en `tests/edge-entrypoints.test.cjs` para exigirla en todas las funciones. No altera algoritmos de checkout, almacenamiento, correo o importes.

## Variables de entorno de producción (solo valores públicos o identificadores)

| Variable | Valor o condición | Ubicación |
|---|---|---|
| `STORE_DEPLOYMENT_MODE` | `production` | Edge Function Secrets |
| `STORE_EXPECTED_SUPABASE_REF` | `ivyagavbhsyzvikzhmhe` | Edge Function Secrets |
| `STORE_BASE_URL` | URL **real** del Worker principal, HTTPS, sin ruta; verificar previamente | Edge Function Secrets |
| `QUOTE_STORAGE_BUCKET` | `quote-reference` (bucket privado ya creado) | Edge Function Secrets |
| `STORE_ALLOWED_ORIGINS` | Solo orígenes autorizados adicionales; nunca el sandbox | Edge Function Secrets |

No copiar `STORE_DEPLOYMENT_MODE=sandbox`, `quote-reference-sandbox`, enlaces al Worker de pruebas ni valores de `pacyytbscnlklyrhsshp`.

## Secretos privados requeridos según función

- Supabase: `SUPABASE_URL` y `SUPABASE_SECRET_KEYS` o `SUPABASE_SERVICE_ROLE_KEY` deben estar disponibles en el entorno **original**. No copiar claves de pruebas ni pegarlas en chat/GitHub.
- Formularios: `TURNSTILE_SECRET` correspondiente al hostname del Worker original. Producción falla cerrada si falta; también se necesitará site key pública al publicar el frontend.
- Correos: `RESEND_API_KEY`, `ORDER_EMAIL_FROM` con dominio autorizado, `ORDER_NOTIFICATION_TO` para avisos al taller.
- Tareas internas: `ORDER_NOTIFICATION_DISPATCH_SECRET` y `ORDER_MAINTENANCE_SECRET` independientes, aleatorios y exclusivos del original; no usar los del sandbox.
- Mercado Pago (aplazar la carga hasta su fase específica): `MP_ACCESS_TOKEN_LIVE` y `MP_WEBHOOK_SECRET_LIVE`. Nunca reutilizar `MP_ACCESS_TOKEN_TEST` o `MP_WEBHOOK_SECRET_TEST` para producción. La ausencia de credenciales LIVE **no autoriza activar pagos**.
- Las nueve funciones usan `verify_jwt=false` en el sandbox porque incluyen endpoints públicos o callbacks y aplican validación propia: verificar sus protecciones individuales en el despliegue final (HMAC para webhook, secretos de despacho para Cron, Turnstile, límites y CORS para formularios). No asumir que `verify_jwt=false` es seguro por sí mismo.

El conector Supabase de esta sesión **permite listar y desplegar Edge Functions, pero no leer ni establecer Edge Function Secrets**. No afirmar que alguno está configurado o ausente sin verificarlo mediante un canal autorizado. No subir secretos al repositorio.

## Orden futuro de despliegue y comprobación

1. Verificar GitHub Actions para el commit exacto del PR #2, incluyendo pruebas y build; no probar contra pagos reales.
2. Verificar en Supabase producción la presencia de cada variable privada indicada y corregir su ausencia directamente en el panel de secretos por la persona autorizada.
3. Confirmar que `checkout_settings.payments_enabled=false`, que 0 productos tengan `checkout_habilitado=true` y que el Worker público siga usando configuración original.
4. Aprobar **por separado** el despliegue de funciones productivas; desplegar cada una con fuente y dependencias de la rama auditada, nombre y `verify_jwt` correctos; registrar versiones y SHA.
5. Probar solicitudes no autorizadas, fallos de secreto, firma HMAC inválida, CORS, host de Turnstile incorrecto, permisos sobre `quote-reference`, y que no se acepten cobros.
6. Preparar Cron y Vault con secretos **nuevos de producción**, sin copiar jobs `checkout-sandbox-*`; no ejecutar correos ni purgas hasta verificar la configuración.
7. Validar correo Resend, MFA/TOTP con recuperación administrativa, privacidad y legales antes de publicar formularios.
8. Publicar frontend y habilitar operaciones solamente tras pruebas y autorización posterior. Los pagos LIVE se autorizan de forma independiente.

## Etapas anteriores verificadas

Las etapas SQL 1, 2 y 3 de producción están instaladas. `quote-reference` es privado; `tienda` conserva 15 archivos y los cinco productos de prueba no se modificaron. El sandbox permanece independiente. No existe respaldo completo restaurable del proyecto original: riesgo expresamente aceptado en las etapas anteriores, **no resuelto**.

**No se desplegó ninguna Edge Function de producción durante esta revisión.**
