# Checkout Pro: sandbox `pacyytbscnlklyrhsshp` (Windows)

Producción (`ivyagavbhsyzvikzhmhe`, Worker `tienda`) queda fuera de este procedimiento. No ejecutar SQL ni deploy remoto antes de autorizar esa fase. Trabajar en `feat/checkout-pro-orders-test`.

## 1. SQL en el proyecto nuevo

Abrir `https://supabase.com/dashboard/project/pacyytbscnlklyrhsshp/sql/new`. Comprobar que el navegador muestra **pacyytbscnlklyrhsshp** antes de cada ejecución. Desde PowerShell, en la raíz del repositorio, copiar y pegar en SQL Editor **un archivo por vez**, pulsando Run y esperando éxito antes del siguiente:

```powershell
Get-Content -Raw .\supabase\test\00_base.sql | Set-Clipboard
Get-Content -Raw .\supabase\migrations\20261114040000_checkout_pro_orders.sql | Set-Clipboard
Get-Content -Raw .\supabase\test\02_seed.sql | Set-Clipboard
Get-Content -Raw .\supabase\test\03_assertions.sql | Set-Clipboard
```

Cada línea es una operación separada: copiar, pegar y ejecutar antes de pasar a la siguiente. La base crea `productos`, `tienda_security.is_admin()` y una tabla de administradores vacía; la semilla agrega `pieza-sandbox-001` ficticia y deshabilitada para compra. `03_assertions.sql` prueba RLS, privilegios, cupo, deduplicación y estados en una transacción que termina en `ROLLBACK`. También puede ejecutarse con `psql -v ON_ERROR_STOP=1 -f <ruta>` contra la conexión obtenida en **Connect** del mismo proyecto. No guardar contraseñas en Git ni usar `supabase db push` contra producción.

## 2. Build y Worker sandbox

Para publicar sin instalar herramientas en Windows, seguir [la guía de GitHub Actions](GITHUB-SANDBOX-DEPLOY.md). El procedimiento local siguiente queda como alternativa de diagnóstico.

El Worker separado se llama `tienda-checkout-sandbox` y usa [wrangler.checkout-preview.jsonc](../wrangler.checkout-preview.jsonc) y `dist-preview/`. Confirmar en Cloudflare que el subdominio Workers de la cuenta es `acero-y-escamas`; la URL prevista es `https://tienda-checkout-sandbox.acero-y-escamas.workers.dev`. Si difiere, corregir la URL antes de cualquier deploy.

En **Supabase → Project Settings → API Keys → Legacy API Keys** del proyecto nuevo, obtener la clave pública **anon JWT**. En PowerShell:

```powershell
$env:STORE_PREVIEW_SUPABASE_URL = 'https://pacyytbscnlklyrhsshp.supabase.co'
$env:STORE_PREVIEW_SITE_URL = 'https://tienda-checkout-sandbox.acero-y-escamas.workers.dev'
$env:STORE_PREVIEW_SUPABASE_ANON_KEY = Read-Host 'Clave pública anon JWT del proyecto pacyytbscnlklyrhsshp'
npm ci
npm run build:preview
```

El build exige ese proyecto, verifica que el `ref` de la clave coincida y rechaza la URL de producción. `dist-preview/assets/js/config.js` contiene solo URL y clave pública de pruebas, con WhatsApp vacío. `dist-preview/productos.json` contiene solo la pieza ficticia. `assets/js/config.js` y `dist/` no cambian. Revisar que el archivo generado no contiene `ivyagavbhsyzvikzhmhe`.

Después de autorizar el deploy del Worker sandbox:

```powershell
npx wrangler deploy --config wrangler.checkout-preview.jsonc
```

No ejecutar `npm run deploy` ni usar `wrangler.jsonc`. Si Cloudflare Builds gestiona el Worker sandbox, poner `npm run build:preview` como Build command, `npx wrangler deploy --config wrangler.checkout-preview.jsonc` como Deploy command, y las tres variables `STORE_PREVIEW_*` anteriores en **Settings → Variables and Secrets** solo de ese Worker. La clave anon es pública. No editar el Worker `tienda`.

## 3. Secretos y Edge Functions de prueba

En `https://supabase.com/dashboard/project/pacyytbscnlklyrhsshp/functions`, abrir **Secrets** o **Edge Functions → Secrets**. Guardar allí, sin compartir valores en chat ni GitHub:

- `MP_ACCESS_TOKEN_TEST`: Access Token de prueba de Mercado Pago.
- `MP_WEBHOOK_SECRET_TEST`: firma secreta del webhook Order de prueba.
- `STORE_BASE_URL`: `https://tienda-checkout-sandbox.acero-y-escamas.workers.dev` (sin barra final).

Tras autorizar el despliegue remoto, desde PowerShell ejecutar estos comandos dirigidos **explícitamente** al proyecto nuevo:

```powershell
npx supabase@3.1.0 functions deploy create-mp-order --project-ref pacyytbscnlklyrhsshp --no-verify-jwt
npx supabase@3.1.0 functions deploy mp-order-webhook --project-ref pacyytbscnlklyrhsshp --no-verify-jwt
npx supabase@3.1.0 functions deploy get-mp-order-status --project-ref pacyytbscnlklyrhsshp --no-verify-jwt
```

Confirmar las tres funciones en el panel del proyecto nuevo. El gateway permite invocación pública; cada función aplica sus propias validaciones. Nunca copiar `service_role` al frontend.

## 4. Webhook Order en Mercado Pago

En el panel de desarrolladores de Mercado Pago abrir la aplicación de prueba, **Webhooks → Configuración de prueba**. Registrar únicamente eventos **Order** con la URL:

`https://pacyytbscnlklyrhsshp.supabase.co/functions/v1/mp-order-webhook`

Guardar y usar la opción de mostrar/copiar la **firma secreta** de esa configuración de prueba. Colocarla como `MP_WEBHOOK_SECRET_TEST` en Secrets de Supabase del proyecto nuevo. No confundirla con el Access Token. Comprobar entregas/reintentos en Mercado Pago y logs de `mp-order-webhook`.

## 5. Compra sandbox: comprobaciones

Crear usuarios vendedor y comprador de prueba según Mercado Pago y usar solo datos de prueba. Para `/admin`, crear una cuenta ficticia en Supabase Auth del proyecto nuevo y agregar solo su UUID a `tienda_security.admins` allí. Establecer comisión, habilitar únicamente `pieza-sandbox-001` y recién entonces encender `payments_enabled`.

Sin extra, el subtotal es $100.000. Con comisión 0%, la orden debe ser $100.000; con el extra ficticio, $101.000. Con 7,5% y sin extra, el total debe ser $108.000 por redondeo. Revisar en DevTools que `create-mp-order` recibe opciones, no un importe confiable; contrastar `total_amount` de Orders API con `checkout_orders`. Un campo `total` manipulado en el navegador no debe modificar el importe del servidor.

Probar aprobación, rechazo, pendiente, reembolso y webhook duplicado. Reenviar la misma notificación firmada si el panel lo permite; `mp_webhook_events.request_id` debe seguir único y el estado no debe retroceder. `/pago` nunca debe mostrar un reembolso como acreditado. No usar tarjetas reales.

Para cada orden, comprobar que `config.online.success_url`, `failure_url` y `pending_url` empiezan con `https://tienda-checkout-sandbox.acero-y-escamas.workers.dev/pago?`; ninguna debe apuntar a `https://tienda.acero-y-escamas.workers.dev/`. El `callback_url` debe apuntar a `pacyytbscnlklyrhsshp`. Al terminar, apagar `payments_enabled`: nuevas creaciones y recuperaciones deben devolver `checkout_disabled`, mientras webhooks de órdenes previas aún se registran.

## Responsables y estado

El propietario puede ejecutar SQL, crear la cuenta ficticia, guardar secretos y registrar el webhook desde los paneles. Yo puedo verificar resultados, ejecutar pruebas locales y, con acceso a la organización nueva y autorización explícita, desplegar solo en los destinos de prueba. La conexión Supabase disponible actualmente solo enumera `ivyagavbhsyzvikzhmhe`; no permite inspeccionar `pacyytbscnlklyrhsshp` desde aquí. Las pruebas SQL y la compra real sandbox siguen pendientes.
