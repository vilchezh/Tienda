# Migración segura al dominio aceroyescamas.com.ar — 21/11/2026

## Estado comprobado
- El propietario confirmó que Resend marca `aceroyescamas.com.ar` como Verified.
- El propietario recibió en Gmail la prueba desde `Acero y Escamas <pedidos@aceroyescamas.com.ar>`.
- La tienda principal responde por HTTPS en `https://aceroyescamas.com.ar`.
- El proyecto Supabase de producción sigue siendo `ivyagavbhsyzvikzhmhe`; el sandbox usa `pacyytbscnlklyrhsshp`.
- `payments_enabled=false` se confirmó mediante lectura SQL. No se autorizó habilitar ventas ni correos a clientes.
- Los avisos de presupuestos y arrepentimientos al vendedor se ejecutan en producción mediante cron. Hay correos a clientes pendientes que NO deben procesarse con esta migración.

## Cambios incluidos en esta rama (todavía NO publicados)
1. El frontend release usa el dominio propio como `siteUrl` y lo valida en el workflow.
2. Turnstile permite verificar tokens emitidos para el hostname del origen real, siempre que el origen esté en `STORE_BASE_URL` o `STORE_ALLOWED_ORIGINS`. Un token emitido para un hostname distinto del origen de la solicitud se rechaza.
3. El diagnóstico de Resend admite los mismos orígenes autorizados, sin permitir que el navegador seleccione destinatarios ni omitir la autenticación del administrador.
4. Pruebas unitarias de orígenes buenos y rechazados. Los cambios no alteran el proyecto sandbox ni sus URLs.
5. No cambia `STORE_CUSTOMER_EMAILS_ENABLED`, `ORDER_EMAIL_FROM`, `RESEND_API_KEY`, `payments_enabled`, ningún cron ni ninguna migración SQL.

## Orden seguro de activación (requiere autorizaciones específicas de producción)

### A. Cloudflare — Turnstile
En el widget actual de producción, agregar `aceroyescamas.com.ar` a **Hostname Management**. Mantener el hostname anterior `tienda.acero-y-escamas.workers.dev`; no crear otro widget y no rotar la Site Key ni el Secret. Comprobar que `www` redirija correctamente al apex antes de darlo como canónico.

### B. Supabase producción — compatibilidad de CORS
En Edge Functions Secrets del proyecto original, **agregar** `https://aceroyescamas.com.ar` a `STORE_ALLOWED_ORIGINS` conservando los orígenes preexistentes. No añadir el proyecto sandbox ni habilitar orígenes arbitrarios. Durante esta fase mantener `STORE_BASE_URL=https://tienda.acero-y-escamas.workers.dev`.

**Importante:** En el código actualmente desplegado, CORS podrá admitir el nuevo sitio tras el ajuste, pero la comprobación de hostname de Turnstile todavía exige el dominio antiguo. No realizar pruebas de registro real desde el nuevo host hasta el paso C.

### C. Desplegar Edge Functions con validación de doble dominio
Tras revisar el diff y las pruebas, desplegar en el proyecto original exclusivamente las funciones que importan el módulo modificado:
- `custom-quote-request`
- `cancellation-request`
- `resend-diagnostic`

Comprobar las respuestas preflight para origen nuevo y anterior, el rechazo de un origen ajeno y la validación de Turnstile por hostname. No invocar procesadores de correos pendientes ni cambiar los cron. No desplegar en sandbox salvo como trabajo independiente específicamente autorizado.

### D. Hacer canónico el dominio nuevo en Supabase
Actualizar `STORE_BASE_URL=https://aceroyescamas.com.ar`. Mantener en `STORE_ALLOWED_ORIGINS` el hostname Workers anterior para una transición y preservación de acceso si se requiere revertir. Las URLs de correo, logo, presupuestos y retorno de pago se generarán desde el dominio propio. No habilitar checkout.

### E. Publicación controlada del frontend
Publicar el commit autorizado mediante `.github/workflows/deploy-production-controlled.yml` con `workflow_dispatch` y confirmación `PUBLICAR-TIENDA`. No se publica por push ni por merge. Verificar el archivo público `/assets/js/config.js` y que `siteUrl=https://aceroyescamas.com.ar`. Mantener Worker `tienda-checkout-sandbox` sin cambios.

### F. Pruebas de aceptación y respaldo
- Portada, catálogo, productos, visor 3D, WhatsApp, imágenes, PDF privados y administrador.
- Presupuestos y arrepentimientos, incluidas sus verificaciones Turnstile válidas e inválidas y códigos de seguimiento; usar solicitudes de ensayo identificadas y luego revisar su registro.
- Diagnóstico Resend solo al Gmail del taller; nunca procesar colas de cliente existentes.
- HTTP, HTTPS, redirección de `www`, escritorio y celular.
- Leer estado de `payments_enabled` y `STORE_CUSTOMER_EMAILS_ENABLED` sin cambiarlos.
- Preparar reversión de la versión de Worker, la URL base y los orígenes, sin deshacer SQL ni enviar correos atrasados.

## Bloqueos intencionales
- No activar `STORE_CUSTOMER_EMAILS_ENABLED=true` por el simple hecho de que Resend ya verifica el dominio. Antes revisar los correos de clientes antiguos y autorizar una prueba separada.
- No habilitar Mercado Pago ni el checkout.
- No modificar DNS MX/SPF hasta decidir recepción de correo con Cloudflare Email Routing. El envío de Resend ya está probado.
- No ejecutar `supabase db push` ni migraciones de esquema; se necesitan auditorías/respaldos específicos antes de ventas reales.
