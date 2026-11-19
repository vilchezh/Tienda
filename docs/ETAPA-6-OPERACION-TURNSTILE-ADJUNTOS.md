# Etapa 6 — Validación real de Turnstile y operación sin emails automáticos

Fecha: 19/11/2026. **No incluir información personal de los formularios en este documento.**

## Resultado positivo de Turnstile en producción

El usuario informó que el widget Managed se resuelve sin intervención, también en modo incógnito. Cloudflare documenta que ese comportamiento es normal: el widget presenta interacción solo cuando es necesaria.

Después del despliegue del Worker de producción del 19/11/2026 a las 23:30 UTC (ID Cloudflare `32d05b95-df71-4018-9827-25b3e99ee191`), la base original recibió:

- 1 presupuesto con estado `new` registrado a las 23:35:47 UTC.
- 2 solicitudes de arrepentimiento con estado `received` registradas a las 23:40:17 y 23:40:48 UTC. Mismo correo, pero distintos `submission_id` y distintos tokens de seguimiento. **No inferir si son pruebas o clientes reales**.
- El servidor llama `verifyTurnstile()` y comprueba `success=true` y hostname `tienda.acero-y-escamas.workers.dev` **antes de insertar** cada solicitud. Los registros nuevos son evidencia de funcionamiento positivo del lado servidor; por confidencialidad no se copiaron emails ni contenidos del formulario.

## Notificaciones todavía no configuradas para entrega pública

Hay 6 entradas `pending`, una para vendedor y otra para cliente por cada una de las 3 solicitudes. No hay prueba de envío ni email de confirmación al cliente. No ejecutar el Cron de notificaciones sobre estos registros hasta resolver el dominio/remitente y revisar las entradas existentes para prevenir correos duplicados o tardíos.

Mientras Resend usa `onboarding@resend.dev`, solo puede enviar a la dirección de la cuenta de Resend. Es obligatorio revisar manualmente, con sesión administrativa:

- `https://tienda.acero-y-escamas.workers.dev/admin` → **Pedidos → Presupuestos a medida**.
- `https://tienda.acero-y-escamas.workers.dev/admin` → **Arrepentimientos**.
- Solo cerrar solicitudes de prueba si se confirmó su origen; no borrar ni cerrar solicitudes de clientes desconocidos.

Las solicitudes de arrepentimiento son comunicaciones potencialmente relevantes para el cliente incluso si los pagos automáticos están apagados.

## Incidencia corregida en frontend: depósito privado de presupuestos

Se detectó `assets/js/quotes-admin.js` descargando **siempre** desde `quote-reference-sandbox` aun en el Worker productivo. Esto impediría que el administrador descargase adjuntos reales, aunque el upload se hubiera realizado al bucket correcto.

Cambios de la rama PR #2:
- `scripts/build.cjs`: emite `quoteStorageBucket='quote-reference'` para `--release` y `quoteStorageBucket='quote-reference-sandbox'` para `--preview`.
- `assets/js/quotes-admin.js`: recupera el bucket desde la configuración pública, valida el nombre permitido y descarga por `client.storage.from(bucket)`. El acceso a objetos sigue gobernado por Auth y Storage RLS.
- `assets/js/config.js`: documenta el bucket productivo para usos estáticos.
- `assets/js/home-admin.js`: elimina etiquetas antiguas de sandbox y distingue en la confirmación entre tienda real y pruebas.
- `tests/preview.test.cjs`, `tests/deployment-config.test.mjs` y `scripts/verify-production-release.cjs`: pruebas de aislamiento y rechazo de rutas sandbox en el paquete productivo.

No se tocaron tablas, solicitudes, correos ni buckets; se requiere un nuevo despliegue del **frontend** del Worker original para activar la corrección. Si la publicación se realiza, registrar aquí el ID Cloudflare y el resultado de CI.

## Limitaciones

No se validó la descarga positiva de un adjunto porque el bucket `quote-reference` aún no tiene archivos; la corrección se comprobó por tests del build, con políticas RLS verificadas. Tampoco se han probado pagos reales ni entregas de Resend a clientes. Los pagos se mantienen apagados.

## Publicación de la corrección — verificada

- Se reactivó la etiqueta `deploy-tienda-production` del PR #2 tras comprobar que las pruebas de código `45732a87771a9644b5cb98a7882664503c68c7c9` y el ensayo SQL estaban aprobados. El commit de frontend publicado fue `462dbde05c6d2641da12506296ed738476340598`.
- [Publicación controlada en GitHub Actions](https://github.com/vilchezh/Tienda/actions/runs/44640909560): **success**. Pruebas unitarias, release dry-run, `verify-production-release.cjs`, subida a Cloudflare, triggers del Worker y comprobación HTTP postdeploy exitosos.
- Nuevo Worker Cloudflare `tienda`, **Version ID `1f27c7bf-613c-4748-9b10-8fa6b531fc59`**. El workflow `deploy-checkout-sandbox` fue **skipped**, sin publicación en pruebas; `main` sigue sin fusionarse.
- El comprobador del paquete exige `quoteStorageBucket='quote-reference'` y que el JS del administrador descargue con `storage.from(bucket)` en lugar de utilizar un nombre de bucket sandbox fijo. El nuevo archivo público `config.js` fue comprobado por el paso postdeploy para Supabase original, Turnstile y WhatsApp. **No se efectuó descarga positiva de un archivo privado real** porque `quote-reference` aún no contiene adjuntos.
- Lectura SQL posterior: `payments_enabled=false`, 0 productos con checkout, 0 pedidos, 1 presupuesto, 2 arrepentimientos, 15 archivos del catálogo conservados, 0 archivos de presupuestos; bucket `quote-reference` continúa privado.
- Requiere atención manual: 1 presupuesto y 2 arrepentimientos están registrados. Se encontraron 6 notificaciones en estado `pending` (vendedor y cliente por cada solicitud), sin Cron ni remitente Resend para compradores. No suponer que llegaron emails. Revisar el panel administrador con una cuenta autorizada y contestar según corresponda.
