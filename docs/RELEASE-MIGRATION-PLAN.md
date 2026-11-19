# Preparación de migración — Acero y Escamas (solo trabajo en sandbox)

**Actualización (solo lectura):** [Inventario SQL de pre-migración](../supabase/production/01_READ_ONLY_PREMIGRATION_INVENTORY.sql), [matriz de 16 migraciones](../supabase/production/migration-review.json) y [protocolo de conciliación](../supabase/production/README.md). **Actualización 19/11/2026:** ambas organizaciones de Supabase ya están conectadas y la base original fue auditada mediante consultas de solo lectura. Ver [auditoría comparativa](./AUDITORIA-SUPABASE-PRODUCCION-2026-11-19.md) y [etapas SQL preparadas](../supabase/production/drafts/README.md). La **etapa 1 SQL (checkout y administración, pagos desactivados)** recibió una autorización condicionada a contar con respaldo recuperable y ensayo. El ensayo aislado fue aprobado, pero **no se ejecutó ninguna migración en producción**, porque falta un respaldo real comprobado. Ver [plan y bloqueo de respaldo](../supabase/production/drafts/README.md).

Estado: preparación del PR #2. No fusionar a main ni publicar Worker o Supabase productivos sin autorización específica.

## Qué se reutiliza
- Un módulo de configuración de Edge Functions `supabase/functions/_shared/deployment-config.mjs` valida en ejecución el proyecto Supabase, la URL de la tienda, el entorno y el depósito de presupuestos.
- Sin `STORE_DEPLOYMENT_MODE`, las funciones permanecen en **sandbox** y solo aceptan el proyecto pacyytbscnlklyrhsshp y el Worker tienda-checkout-sandbox. Así no se autoriza producción accidentalmente.
- Solo con `STORE_DEPLOYMENT_MODE=production`, `STORE_EXPECTED_SUPABASE_REF` que coincida con el proyecto correcto, `QUOTE_STORAGE_BUCKET` distinto del de pruebas y URL HTTPS diferente se permite el modo producción. Esto no habilita pagos: lo controla `checkout_settings.payments_enabled` y la disponibilidad de credenciales productivas.
- Mercado Pago usa `MP_ACCESS_TOKEN_TEST` / `MP_WEBHOOK_SECRET_TEST` en sandbox y **exclusivamente** `MP_ACCESS_TOKEN_LIVE` / `MP_WEBHOOK_SECRET_LIVE` en producción. No se permite usar el token de pruebas como alternativa si faltan credenciales productivas.
- Correos de pago, presupuestos y arrepentimientos construyen el logo usando `STORE_BASE_URL`. El bloqueo de destinatarios de prueba permanece en sandbox; producción solo podrá enviar a clientes reales cuando esté plenamente configurada y autorizada.
- Turnstile verifica el hostname basado en `STORE_BASE_URL`; en producción **requiere** un secreto `TURNSTILE_SECRET` (si falta, los formularios nuevos fallan cerrados). En sandbox sigue opcional por ahora.
- Las subidas de fotos y modelos publicables usan bucket `tienda`; migración `20261118130000_storefront_public_storage.sql` crea el depósito si falta, con inserciones solo de administradores, extensiones permitidas y MIME controlados por bucket. Los planos de clientes son privados en otro depósito.
- `npm run build:release` genera `dist/assets/js/config.js` desde variables **públicas** de entorno. No reutiliza el proyecto Supabase de pruebas ni permite URL sandbox. El comando `npm run deploy` exige ese build antes de publicar. `npm run build:preview` y su workflow conservan el aislamiento de pruebas.

## Variables del build productivo — configurar posteriormente (no ahora)
| Variable | Destino | Notas |
|---|---|---|
| `STORE_PROD_SUPABASE_URL` | GitHub Actions release | URL pública HTTPS del proyecto productivo |
| `STORE_PROD_SUPABASE_REF` | GitHub Actions release | ID exacto de proyecto para detectar mezclas |
| `STORE_PROD_SUPABASE_ANON_KEY` | GitHub Actions release | Clave **pública anon/publishable**, nunca service_role |
| `STORE_PROD_SITE_URL` | GitHub Actions release | URL definitiva sin ruta extra |
| `STORE_PROD_TURNSTILE_SITE_KEY` | GitHub Actions release | Clave pública del widget del dominio real |
| `STORE_PROD_WHATSAPP_NUMBER` | GitHub Actions release | Número solo dígitos o vacío |

## Variables Edge Function productivas — configurar en Supabase producción después
- `STORE_DEPLOYMENT_MODE=production`; `STORE_EXPECTED_SUPABASE_REF=<ref prod>`; `STORE_BASE_URL=<dominio final>`; `QUOTE_STORAGE_BUCKET=quote-reference` (o depósito privado dedicado, no usar quote-reference-sandbox); `STORE_ALLOWED_ORIGINS=<orígenes estrictamente autorizados>`.
- `MP_ACCESS_TOKEN_LIVE`, `MP_WEBHOOK_SECRET_LIVE`, `RESEND_API_KEY`, `ORDER_EMAIL_FROM`, `ORDER_NOTIFICATION_TO`, `TURNSTILE_SECRET`, `ORDER_NOTIFICATION_DISPATCH_SECRET`, `ORDER_MAINTENANCE_SECRET` y claves automáticas `SUPABASE_SECRET_KEYS`. No subir ninguna a GitHub.
- La cuenta Supabase y el Worker de producción deben tener su propia autenticación, Vault, almacenamiento, políticas RLS y jobs cron. No transferir las filas, compradores ni archivos ficticios del sandbox.
- `STORE_DEPLOYMENT_MODE=production` solo activa selección de configuración. **Nunca** es autorización de publicar ni de cobrar.

## Migraciones SQL: no aplicar todas a ciegas
1. Inventariar las tablas y RLS **ya existentes** en la base productiva. Validar los nombres, los permisos y las políticas antes de ejecutar migraciones; contar con respaldo y plan de restauración.
2. Revisar y aplicar las migraciones funcionales que falten (`20261114040000_checkout_pro_orders.sql`, `20261114204035_order_management.sql`, ajustes posteriores de pedidos, contenido, arrepentimientos y presupuestos) con una copia de ensayo y comprobaciones SQL. Algunas pueden estar ya presentes en producción.
3. **No reproducir literalmente** las migraciones sandbox que contienen URLs y nombres fijos: `20261118034000_checkout_cancellation_cron.sql`, `20261118064000_custom_quote_email_cron.sql`, el bloque del bucket privado en `20261118060000_custom_quote_requests.sql` y la política de `20261118061500_custom_quote_storage_read.sql`. Deben parametrizarse para la base y bucket productivos y crear jobs de producción distintos, con secretos independientes en Vault. No copiar jobs `checkout-sandbox-*`.
4. La migración nueva `20261118130000_storefront_public_storage.sql` es reusable: no elimina archivos ni sobrescribe depósitos existentes; verificar previamente si el bucket `tienda` de producción ya existe y revisar límites y MIME. Los modelos `.glb` se publican, los PDF de presupuestos **nunca**.
5. Aplicar solamente el esquema y las políticas, no los seeds de `supabase/test/`, ni `productos-preview.json`, ni códigos COT/ARR, ni pedidos, ni correos de prueba.
6. Crear un depósito privado para presupuestos, con la política de descarga solo para `tienda_security.is_admin()`, tamaño 5 MB por archivo y tipos JPG/PNG/WebP/PDF. Debe usar exactamente el valor de `QUOTE_STORAGE_BUCKET` productivo. Revisar cuotas globales y borrado seguro de borradores.
7. Preparar Cron, secretos Vault y RLS en producción. Ejecutar pruebas negativas de roles `anon` y `authenticated` no admin antes de migrar datos o activar formularios.

## Bloqueos de lanzamiento (pendientes a propósito)
- MFA/TOTP real del administrador productivo y recuperación segura de la cuenta.
- Turnstile real: claves del dominio definitivo, pruebas de token válido/inválido y bloqueos correctos.
- Configuración de dominio y remitente Resend, cuota de correos y confirmación de recepción (sin adjuntar planos).
- Política legal/comercial argentina: CUIT, domicilio, condiciones y plazos de fabricación, envío y devoluciones. Política de retención para presupuestos confirmados y arrepentimientos.
- Privacidad y seguridad de PDF sin escaneo antivirus (decisión actual). El cliente debe conocer que subir PDF no implica verificación de malware.
- Pasar CSP de Report-Only a protección real solo después de comprobar dependencias externas, producto 3D y checkout; actualmente la política observa pero no bloquea XSS.
- Pruebas de pagos controlados con Mercado Pago LIVE, fallidos, aprobados, duplicados, reembolsados y contracargos, más correos y conciliación. No habilitar `payments_enabled` en sandbox ni producción hasta finalizar.
- Verificar y restaurar copias de respaldo, revertir Worker en Cloudflare, desactivar compras ante incidentes.

## Órdenes de verificación
- `npm run test:unit`: incluye separación de entornos, modos Mercado Pago, MIME y todas las Edge Function entrypoints.
- `npm test`: pruebas de navegador y Wrangler.
- `npm run build:preview`: compila solo para el sandbox, con catálogo ficticio.
- `npm run build:release`: requiere TODAS las variables públicas productivas y valida que no coincidan con el sandbox. **No ejecutarlo todavía con datos reales ni desplegar `dist` antes de autorizar producción**.
- `npm run check:deploy`: dry-run de la compilación actual para regresiones. `npm run check:release`: dry-run productivo cuando estén configuradas las variables definitivas.

La tienda original `tienda` y la rama `main` quedan fuera de alcance de esta etapa.