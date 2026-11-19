# Etapa 5 — Preparación de Turnstile y correos sin dominio propio (19/11/2026)

**Estado: preparación y pruebas sin publicación en el Worker original.** El propietario autorizó avanzar con las tareas viables manteniendo los pagos apagados. No se cambió `main`, Cloudflare Worker `tienda`, los secretos productivos de Supabase ni el sandbox.

## Turnstile: integración existente, falta prueba positiva real

- Los formularios `presupuesto.html` y `arrepentimiento.html` ya llaman al módulo compartido `assets/js/turnstile-forms.js`, que toma **solo la sitekey pública** de `window.STORE_CONFIG.turnstileSiteKey`.
- Los endpoints `custom-quote-request` y `cancellation-request` validan el token mediante Siteverify con el secreto privado `TURNSTILE_SECRET` configurado por el usuario en **Supabase original**. Exigen que el hostname verificado coincida con `STORE_BASE_URL` y fallan cerrados si el secreto falta.
- El build de producción `npm run build:release` **ya rechaza** una sitekey ausente o inválida. Su variable pública exacta es `STORE_PROD_TURNSTILE_SITE_KEY` (no confundir con `TURNSTILE_SECRET`). La sitekey pública de producción `0x4AAAAAAGJONVP8yIMQn-Tg` fue proporcionada por el propietario e integrada como valor predeterminado en `scripts/build.cjs` (rama del PR #2); `STORE_PROD_TURNSTILE_SITE_KEY` continúa disponible como sustitución explícita al rotar el widget. No se necesita repetir la sitekey en Supabase y el `TURNSTILE_SECRET` sigue únicamente en el panel de secretos del proyecto original.
- El widget creado por el propietario se configuró para `tienda.acero-y-escamas.workers.dev`. Las pruebas reales de un token válido requieren servir la página desde ese hostname, completar el widget en un navegador y confirmar la aceptación del servidor. **No se ejecutó esa prueba positiva**, porque el frontend de PR #2 aún no está publicado en el Worker original y no hay una sesión de navegador de ese origen para resolver el desafío. La sitekey pública ya está disponible en el código, pero no equivale a una prueba en el hostname real.
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

1. **HECHO**: la Site Key pública fue facilitada e integrada en el build del PR #2, con pruebas de inclusión exclusiva en la configuración del navegador de producción. **Nunca compartir `TURNSTILE_SECRET` ni la API key de Resend.**
2. Validar que `ORDER_NOTIFICATION_TO` corresponda al email registrado en la cuenta Resend si se desea una prueba controlada de avisos del vendedor.
3. Antes de publicar formularios al público, definir si funcionarán sin acuse automático de email, con entrega manual y código de seguimiento, o si se pospone la publicación hasta verificar un remitente apto para clientes. No afirmar que Resend puede enviar a todos mientras se use `onboarding@resend.dev`.
4. Una vez autorizado específicamente el deploy del frontend productivo, probar una solicitud deliberadamente identificada como prueba (con token Turnstile real, sin pagos), verificar el estado privado y eliminarla solamente después de confirmar el alcance; no hacer envíos masivos.
5. Mantener `payments_enabled=false`, todos los `checkout_habilitado=false`, y no programar jobs de correos o de limpieza todavía.

**Sin compra de dominio ni gastos autorizados, el trabajo actual termina en validación de código, configuración pendiente y documentación.**

## Verificación final de los cambios de esta etapa

- La modificación de build `389acf26138e9e8e392dff46f7dc55c458d68a85` y su prueba de regresión `606bf43aa34efb356707adf8fc88b7293a88313a` superaron la batería `Tienda · regresiones`: https://github.com/vilchezh/Tienda/actions/runs/44628846471
- El ensayo SQL aislado terminó con éxito: https://github.com/vilchezh/Tienda/actions/runs/44628846512
- Lectura productiva posterior: `payments_enabled=false`, cero productos habilitados para checkout, cero pedidos/presupuestos/arrepentimientos, 15 activos conservados en `tienda`, bucket `quote-reference` privado.
- El PR #2 sigue abierto, sin merge a `main`. No se ha realizado un despliegue del Worker ni un test de Turnstile válido en navegador. El sandbox sigue intacto.

## Site Key recibida e integración en la rama

- Site Key pública de Turnstile: `0x4AAAAAAGJONVP8yIMQn-Tg` (compartida por el propietario).
- Configuración privada `TURNSTILE_SECRET`: el propietario confirmó que ya la guardó en Supabase original; no puede verificarse el valor desde la conexión, ni debe mostrarse en GitHub.
- Modificación de código: `scripts/build.cjs` incorpora la clave pública como predeterminada **solo al ejecutar `--release`** y permite reemplazarla explícitamente si el widget se rota. La rama sandbox no adopta esta clave.
- Test agregado en `tests/deployment-config.test.mjs` verifica que el build de producción contiene esa sitekey, nunca la clave privada, y que ambos formularios integran `turnstile-forms.js`.
- **No se publicó el Worker** ni se ejecutó un desafío con un token válido en el dominio real. Esta prueba positiva sigue pendiente.
