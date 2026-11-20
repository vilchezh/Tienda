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

## Publicación controlada — intento 19/11/2026

Se añadió el script de verificación `scripts/verify-production-release.cjs` y el flujo de GitHub Actions `.github/workflows/deploy-production-controlled.yml`, con verificación de compilación en cada prueba, publicación solo ante evento expreso y control de credenciales específicas de producción. El workflow preserva el número de WhatsApp vigente y exige la sitekey pública de Turnstile.

1. **Preflight inicial SIN publicar:** https://github.com/vilchezh/Tienda/actions/runs/44633506286 — `success`. Build release, tests unitarios, dry run de Wrangler y verificación de configuración.
2. **Intento de publicación explícito en PR #2:** https://github.com/vilchezh/Tienda/actions/runs/44633772824 — `failure` porque faltan ambos secretos GitHub de Cloudflare **exclusivos de producción**. Pasaron correctamente todos los pasos previos. Los pasos `wrangler deploy` y verificación pública se marcaron `skipped`. **Worker original sin cambios**.
3. El usuario debe crear en GitHub → repositorio `vilchezh/Tienda` → Settings → Secrets and variables → Actions → Repository secrets:
   - `CLOUDFLARE_API_TOKEN_PRODUCTION`: token nuevo de Cloudflare con permiso mínimo para publicar el Worker `tienda`.
   - `CLOUDFLARE_ACCOUNT_ID_PRODUCTION`: identificador de la cuenta Cloudflare que contiene el Worker `tienda`.
   - **No usar ni borrar** `CLOUDFLARE_API_TOKEN_SANDBOX` ni `CLOUDFLARE_ACCOUNT_ID_SANDBOX`; el sandbox permanece separado. No enviar el token al chat ni agregarlo al repositorio.
4. Cuando esos dos secrets estén guardados, se pueden **reintentar los jobs fallidos** de la ejecución `44633772824` sin nuevo commit ni fusión a main. La ejecución fallida fue iniciada con la etiqueta `deploy-tienda-production` del PR. No se habilitarán pagos, no se publicarán credenciales privadas y no se modificará SQL como parte de ese flujo.
5. El resultado correcto se confirma únicamente cuando `wrangler deploy` y la comprobación posterior de `https://tienda.acero-y-escamas.workers.dev/assets/js/config.js` pasan con el proyecto Supabase original y Site Key de Turnstile. La prueba de Turnstile **válida** por navegador todavía deberá realizarse después.
6. El despliegue reemplaza el **frontend completo** del Worker `tienda` por la versión del PR #2, sin fusionar `main`. Debe tratarse como publicación productiva y revisarse el sitio; revertirlo, de ser necesario, desde el historial de versiones de Cloudflare.

Documentación Cloudflare: https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/

## Publicación de producción efectiva — 19/11/2026

- El usuario confirmó que incorporó ambas credenciales de Cloudflare en **Repository Secrets** de GitHub.
- Se reintentó el job fallido de [GitHub Actions 44633772824](https://github.com/vilchezh/Tienda/actions/runs/44633772824). **Último intento: SUCCESS**; pruebas unitarias, `check:release` (con Wrangler dry-run), `verify-production-release.cjs`, comprobación de credenciales Cloudflare, `wrangler deploy --config wrangler.jsonc` y verificación postdeploy aprobaron.
- Cloudflare reportó `Uploaded tienda`, `Deployed tienda triggers`, URL `https://tienda.acero-y-escamas.workers.dev`; **Worker Version ID `32d05b95-df71-4018-9827-25b3e99ee191`**.
- La comprobación postdeploy consultó el archivo público `/assets/js/config.js` y confirmó proyecto Supabase productivo `ivyagavbhsyzvikzhmhe`, Site Key pública Turnstile `0x4AAAAAAGJONVP8yIMQn-Tg` y WhatsApp configurado `5491164598478`, sin referencia al sandbox.
- Se volvió a comprobar por SQL que `checkout_settings.payments_enabled=false` y 0 productos tienen checkout activo. Los cinco productos y 15 objetos originales siguen presentes; el bucket `quote-reference` continúa privado; no hay pedidos, presupuestos ni arrepentimientos nuevos en el momento del chequeo.
- No se fusionó el PR #2 con `main`; el despliegue utilizó el commit autorizado `136c98c76e494de48532287e07bb00089335f8e1` de la rama del PR (el registro de documentación posterior no cambia el Worker desplegado).
- **Aún pendiente:** comprobar desde un navegador humano un token Turnstile válido en los formularios y las vistas móviles, así como la entrega de correos a clientes. Resend continúa usando remitente de prueba limitado, por lo que no debe activarse Cron de notificaciones ni pagos LIVE antes de resolverlo. El servidor ya rechazó tokens faltantes e inválidos, pero esa prueba no equivale a una prueba positiva del widget.

**Si se necesita rollback del frontend:** usar versiones de Worker en Cloudflare y restaurar una versión anterior de `tienda`; este documento no implica que se haya realizado un rollback ni un respaldo completo de Supabase.
