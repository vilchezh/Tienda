# Publicar el frontend sandbox desde GitHub, sin instalar nada

El workflow [deploy-checkout-sandbox.yml](../.github/workflows/deploy-checkout-sandbox.yml) construye `dist-preview` y publica únicamente `tienda-checkout-sandbox` con `wrangler.checkout-preview.jsonc`. No usa `wrangler.jsonc`, que pertenece a la tienda publicada.

## Configuración desde el navegador

1. En **Cloudflare → Workers & Pages**, confirmar que el subdominio de la cuenta es `acero-y-escamas` y que la URL prevista para el Worker separado es `https://tienda-checkout-sandbox.acero-y-escamas.workers.dev`. Si Cloudflare muestra otra URL, detenerse: el build falla hasta revisar la URL de retorno y el nombre del Worker.
2. En **Cloudflare → My Profile → API Tokens → Create Token**, crear un token para editar Workers en la cuenta correcta, con el alcance mínimo que permita publicar ese Worker. Guardarlo solo en GitHub. El token de cuenta puede tener alcance más amplio que un solo script, por eso el workflow comprueba el nombre antes del deploy.
3. Obtener el **Account ID** de esa misma cuenta en Cloudflare.
4. En **GitHub → vilchezh/Tienda → Settings → Secrets and variables → Actions → New repository secret**, crear `CLOUDFLARE_API_TOKEN_SANDBOX`, `CLOUDFLARE_ACCOUNT_ID_SANDBOX` y `STORE_PREVIEW_SUPABASE_ANON_KEY`. Esta última es la clave pública **anon JWT** de `pacyytbscnlklyrhsshp`, obtenida en **Supabase → Project Settings → API Keys → Legacy API Keys**; nunca usar `service_role`, `sb_secret_` ni Access Tokens de Mercado Pago. No pegarlas en issues, PR ni chat.
5. En el PR #2, crear o usar la etiqueta `deploy-checkout-sandbox`. Antes de aplicarla, revisar que el PR sigue apuntando de `feat/checkout-pro-orders-test` a `main` y que el commit contiene este workflow.

## Ejecutar manualmente desde GitHub

En **GitHub → PR #2 → Labels**, agregar `deploy-checkout-sandbox`. Esa acción inicia el workflow `Desplegar tienda checkout sandbox`; abrir la pestaña **Checks** del PR para seguirlo. Para repetirlo luego, quitar la etiqueta y volver a agregarla. El workflow solo corre si coincide la rama, el repositorio, la base y la etiqueta. Construye, verifica el proyecto Supabase y el catálogo ficticio, hace un dry-run y entonces publica el Worker separado.

GitHub requiere que el archivo de un workflow `workflow_dispatch` exista en la rama por defecto para mostrar **Actions → Run workflow**. Este archivo está solo en la rama del PR por la restricción de no cambiar `main`; la etiqueta del PR es el disparador manual disponible ahora. La opción `workflow_dispatch` queda preparada para cuando ese archivo exista en la rama por defecto, pero no es el mecanismo para esta etapa.

Al finalizar, abrir `https://tienda-checkout-sandbox.acero-y-escamas.workers.dev/` y comprobar una pieza `SANDBOX-001`, ausencia de enlace WhatsApp y rutas `/producto?id=pieza-sandbox-001`, `/admin` y `/pago`. En DevTools → Network, las llamadas REST y Edge Functions deben usar únicamente `pacyytbscnlklyrhsshp.supabase.co`. No activar `payments_enabled` hasta validar esta separación. Si el workflow falla, no repetirlo a ciegas: revisar el paso fallido y corregir su causa.

## Advertencia `public.rls_auto_enable()`

Antes de cambiar permisos, identificar en **SQL Editor del proyecto que muestra la advertencia** las firmas y privilegios reales (consulta de solo lectura):

```sql
select p.oid::regprocedure as signature, p.prosecdef as security_definer,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
       (select count(*) from pg_trigger t where t.tgfoid = p.oid and not t.tgisinternal) as triggers_que_la_usan
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'rls_auto_enable';
```

Si la firma es `public.rls_auto_enable()` y no hay un motivo documentado para invocarla desde clientes, la corrección mínima propuesta es:

```sql
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
```

`PUBLIC` en SQL es el permiso heredado por todos los roles. Revocarlo junto a los grants explícitos de `anon` y `authenticated` elimina la invocación directa desde Data API; el propietario conserva control. Si la función tiene argumentos o una dependencia que requiere otro rol, ajustar la firma y conceder solo a ese rol después de inspeccionar las dependencias. No ejecutar este SQL todavía: primero confirmar **qué proyecto** reportó la advertencia y la firma exacta; después volver a consultar los privilegios y el Security Advisor.
