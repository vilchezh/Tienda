# Cierre de la migración funcional del PR #2 a main — 20/11/2026

## Qué se considera terminado

- La tienda pública se sirve desde el Worker Cloudflare **tienda**, en `https://tienda.acero-y-escamas.workers.dev`.
- La publicación de la portada corregida se verificó en GitHub Actions [44669778162](https://github.com/vilchezh/Tienda/actions/runs/44669778162), sin alterar Supabase.
- La base de producción es exclusivamente **ivyagavbhsyzvikzhmhe**; el sandbox es **pacyytbscnlklyrhsshp**. No se trasladan usuarios, pedidos ni productos de ensayo entre proyectos.
- Producción (auditoría 20/11/2026): **5 productos existentes**, **0 productos con checkout habilitado**, **`checkout_settings.payments_enabled=false`**, **1 administrador**, **1 factor MFA verificado**. Todas las tablas de `public` tienen RLS habilitado.
- En producción hay **11 Edge Functions ACTIVE** y una tarea Cron exclusiva de avisos al taller, `acero-y-escamas-seller-emails-10m`, protegida por un token en Supabase Vault. No envía correos a clientes.
- Resend acepta y entrega avisos al taller con `onboarding@resend.dev`, pero **NO** correos a cualquier comprador. Hay 3 mensajes de prueba para clientes en cola y sin procesar.
- En la rama del PR se incluyen el catálogo, precios, Checkout Pro Orders API, pedidos, formularios, gestión del inicio, RLS, seguridad y herramientas de despliegue.

## Respaldo de código y publicación

- Antes de integrar el PR #2 se creó **`backup/main-pre-pr2-20261120`**, apuntando al commit anterior de `main`: `63bcca33ef726710cd65711a36d1f638d978055b`.
- La rama de respaldo preserva el **código anterior**, NO constituye una copia restaurable de la base de datos, secretos Supabase Vault, Cloudflare ni Storage.
- La publicación de Cloudflare no ocurre por hacer `git push` ni por fusionar el PR: `.github/workflows/deploy-production-controlled.yml` limita el paso de publicación a una autorización manual mediante `workflow_dispatch` + confirmación `PUBLICAR-TIENDA`, o al evento especial con etiqueta en el PR #2, mientras esté abierto. Los `push` solo verifican.
- Tras integrar el PR, la publicación productiva manual se debe hacer desde `main` usando ese workflow; el sandbox manual también admite `main` pero siempre se despliega en otro Worker con otras credenciales.
- La restauración del Worker anterior requiere usar historial de versiones/rollback en Cloudflare; **no ejecutar** la publicación de la rama de respaldo sin revisar su configuración, pues el código viejo no conoce todas las funciones actuales.

## Historial SQL: advertencia importante

- En la base original, las únicas migraciones registradas como `supabase_migrations` al 20/11/2026 son:
  1. `20261119191949 production_stage1_checkout_admin_20261119`.
  2. `20261119192430 production_stage2_cancellations_quotes_20261119`.
  3. `20261119193557 production_stage3_private_quote_storage_20261119`.
- Las correcciones SQL adicionales de `supabase/production/drafts/04_EMAIL_SELLER_CLAIMS.sql`, `05_RESEND_DIAGNOSTIC_RATE_LIMIT.sql`, `06_SELLER_EMAIL_SCHEDULER_AUTH.sql` y `07_SELLER_EMAIL_CRON_10M.sql` **ya fueron ejecutadas directamente en la producción original**, pero **no figuran como nuevas versiones del historial CLI**. Se verificaron las funciones, permisos, Vault y Cron.
- `supabase/config.toml` del repositorio apunta al **sandbox** para desarrollo, no a producción.
- **NO ejecutar `supabase db push`, `db reset`, ni todas las migraciones bajo `supabase/migrations/` contra producción**: varias son específicas del proyecto de pruebas e incluyen configuraciones de Cron y destinos sandbox. Cualquier futura conciliación deberá comparar el esquema vivo, revisar los scripts por separado y evitar repetir o duplicar trabajos existentes.
- No se ha efectuado todavía una restauración integral ensayada de la base productiva y Storage. Antes de vender, preparar exportación/restauración y plan de respaldo según el plan de Supabase.

## Qué queda pendiente antes de venta real

1. Registrar el dominio `.com.ar` y configurarlo en Cloudflare. Actualizar dominios, Turnstile y URLs canónicas con pruebas y sin perder acceso al hostname Workers.
2. Verificar dominio en Resend; luego autorizar por separado remitente y envío de correos a compradores. No habilitar `STORE_CUSTOMER_EMAILS_ENABLED` mientras se use `onboarding@resend.dev`.
3. Revisar textos comerciales, identidad fiscal, condiciones de venta, envío, devoluciones y privacidad.
4. Verificar respaldo y recuperación de base + Storage, pruebas negativas de seguridad y pruebas reales controladas de Mercado Pago (pagos aprobados y fallidos, reembolsos y contracargos). **No activar `payments_enabled` sin autorización expresa**.
5. CSP actualmente `Report-Only`; estudiar compatibilidad antes de hacerlo restrictivo.

La fusión a `main` solo integra el **código fuente**. No ejecuta SQL en Supabase, no cambia sus secretos y no debe ejecutar despliegues automáticos a Cloudflare.
