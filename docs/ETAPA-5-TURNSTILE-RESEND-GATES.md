# Etapa 5 — Preparación de Turnstile y correos sin dominio propio (19/11/2026)

**Estado: preparación y pruebas sin publicación en el Worker original.** El propietario autorizó avanzar con las tareas viables manteniendo los pagos apagados. No se cambió `main`, Cloudflare Worker `tienda`, los secretos productivos de Supabase ni el sandbox.

## Turnstile: integración existente, falta prueba positiva real

- Los formularios `presupuesto.html` y `arrepentimiento.html` ya llaman al módulo compartido `assets/js/turnstile-forms.js`, que toma **solo la sitekey pública** de `window.STORE_CONFIG.turnstileSiteKey`.
- Los endpoints `custom-quote-request` y `cancellation-request` validan el token mediante Siteverify con el secreto privado `TURNSTILE_SECRET` configurado por el usuario en **Supabase original**. Exigen que el hostname verificado coincida con `STORE_BASE_URL` y fallan cerrados si el secreto falta.
- El build de producción `npm run build:release` **ya rechaza** una sitekey ausente o inválida. Su variable pública exacta es `STORE_PROD_TURNSTILE_SITE_KEY` (no confundir con `TURNSTILE_SECRET`). La clave pública deberá configurarse en el entorno de build productivo (por ejemplo GitHub Actions) cuando exista el proceso de publicación autorizado.
- El widget creado por el propietario se configuró para `tienda.acero-y-escamas.workers.dev`. Las pruebas reales de un token válido requieren servir la página desde ese hostname, completar el widget en un navegador y confirmar la aceptación del servidor. **No se ejecutó esa prueba**, porque el frontend de PR #2 aún no está publicado en el Worker original y no tenemos acceso a una sesión de usuario ni a su sitekey pública.
- Las 17 pruebas HTTP de producción anteriores pasaron: tokens faltantes, firmas inválidas, accesos no autorizados y lecturas con credenciales ficticias son rechazados; **no equivalen** a validar un token real.
- La CDN de Cloudflare no requiere un dominio comprado para Turnstile.
- Documento oficial: https://developers.cloudflare.com/turnstile/get-started/

## Resend: remitente temporal no apto para clientes

- El usuario configuró `ORDER_EMAIL_FROM=Acero y Escamas <onboarding@resend.dev>`, `RESEND_API_KEY` y `ORDER_NOTIFICATION_TO` en el proyecto original.
- Con `onboarding@resend.dev`, Resend normalmente **solo permite envíos de prueba a la dirección de correo que administra la cuenta Resend**. `ORDER_NOTIFICATION_TO` debería ser esa misma dirección si se quiere comprobar avisos del taller. No podemos leer/validar aquí ni la API key ni la dirección de titular de Resend.
- **No ejecutar los procesadores de correo de producción ni activar Cron** como si el envío a clientes estuviera preparado. El proveedor puede devolver 403 a clientes ajenos y las colas de notificaciones marcan rechazos definitivos; tampoco debe mostrarse en el formulario que se enviará un correo que todavía no está asegurado.
- Para pasar a envío transaccional real con Resend se requiere un dominio verificado y cambiar `ORDER_EMAIL_FROM` a un remitente de ese dominio. Usar Gmail directamente como `ORDER_EMAIL_FROM` en Resend no resuelve la verificación DNS. Una alternativa de otro proveedor sería una decisión de integración distinta, a evaluar separadamente; no se adoptó por defecto.
- Fuente oficial de requisitos y pruebas: https://resend.com/docs/knowledge-base/what-does-this-error-mean

## Avisos de formularios corregidos

En esta etapa se modificó **solo la compilación de producción** en `scripts/build.cjs` para sustituir los tres avisos exclusivos del sandbox de `presupuesto.html` y `arrepentimiento.html` por mensajes que explican que las confirmaciones automáticas aún no están habilitadas y que se debe guardar el código/enlace. Se agregaron aserciones a `tests/deployment-config.test.mjs` para impedir regresiones. Las páginas fuente y el build de sandbox mantienen sus textos de prueba; ningún formulario fue publicado.

## Pasos bloqueados para una futura validación positiva

1. El propietario debe facilitar **solo la sitekey pública** de Turnstile o configurarla como `STORE_PROD_TURNSTILE_SITE_KEY` en el entorno de build de producción. **Nunca compartir `TURNSTILE_SECRET` ni la API key de Resend.**
2. Validar que `ORDER_NOTIFICATION_TO` corresponda al email registrado en la cuenta Resend si se desea una prueba controlada de avisos del vendedor.
3. Antes de publicar formularios al público, definir si funcionarán sin acuse automático de email, con entrega manual y código de seguimiento, o si se pospone la publicación hasta verificar un remitente apto para clientes. No afirmar que Resend puede enviar a todos mientras se use `onboarding@resend.dev`.
4. Una vez autorizado específicamente el deploy del frontend productivo, probar una solicitud deliberadamente identificada como prueba (con token Turnstile real, sin pagos), verificar el estado privado y eliminarla solamente después de confirmar el alcance; no hacer envíos masivos.
5. Mantener `payments_enabled=false`, todos los `checkout_habilitado=false`, y no programar jobs de correos o de limpieza todavía.

**Sin compra de dominio ni gastos autorizados, el trabajo actual termina en validación de código, configuración pendiente y documentación.**
