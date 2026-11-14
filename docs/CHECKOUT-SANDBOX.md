# Sandbox independiente para Checkout Pro

Estos pasos son para un proyecto Supabase **nuevo y vacío**, creado más adelante por el propietario. No copiar tablas, usuarios ni archivos del proyecto publicado. El producto de prueba es inventado; la vista previa utiliza los assets estáticos del repositorio sin consultar el catálogo publicado.

## Orden de SQL

En el editor SQL del **proyecto nuevo**, comprobar primero el identificador del proyecto y ejecutar en este orden, revisando cada archivo:

1. `supabase/test/00_base.sql`: crea `tienda_security.admins` vacío, `is_admin()` y la estructura mínima de `public.productos` con RLS.
2. `supabase/migrations/20261114040000_checkout_pro_orders.sql`: agrega tablas y funciones de checkout. No usar `supabase db push` conectado al proyecto publicado.
3. `supabase/test/02_seed.sql`: inserta `pieza-sandbox-001`, ficticia, activa para catálogo y con compra directa deshabilitada.
4. `supabase/test/03_assertions.sql`: pruebas SQL transaccionales de RLS, privilegios, deduplicación, finalización y estados. Requiere `psql -v ON_ERROR_STOP=1` contra **esa base de prueba**, pues el editor SQL puede no mostrar con claridad el primer error. Termina en `ROLLBACK`.

La base no incorpora administradores. Para probar `/admin` después, crear una cuenta de ensayo en Supabase Auth del proyecto nuevo y agregar exclusivamente su UUID a `tienda_security.admins` en ese proyecto. No reutilizar cuentas ni contraseñas de producción. Hasta ese momento el interruptor global y el del producto quedan apagados.

## Vista previa aislada

Definir estas variables en el entorno de build de la rama de prueba, con la URL y la clave **pública anon JWT del proyecto nuevo** (sección Legacy API Keys de Supabase). El build compara el `ref` de esa clave con la URL para evitar mezclar proyectos:

```sh
STORE_PREVIEW_SUPABASE_URL=https://REF_NUEVO.supabase.co
STORE_PREVIEW_SUPABASE_ANON_KEY=CLAVE_PUBLICA_DEL_PROYECTO_NUEVO
STORE_PREVIEW_SITE_URL=https://URL_DE_PREVIEW_CLOUDFLARE
```

Ejecutar `npm run build:preview`. El script exige un ref distinto de `ivyagavbhsyzvikzhmhe`, verifica que un JWT anon corresponda al ref, crea `dist-preview/`, reemplaza allí `assets/js/config.js`, deshabilita WhatsApp y copia únicamente el catálogo ficticio. El archivo público original y `dist/` no cambian. Configurar el preview de Cloudflare para usar `wrangler.checkout-preview.jsonc` y su directorio `dist-preview`, nunca el Worker `tienda` de producción. `npm run preview:checkout` prepara y ejecuta `wrangler preview` cuando el proyecto nuevo esté listo; este PR no lo ejecuta.

## Secretos y compra sandbox posterior

En **Edge Function Secrets del proyecto nuevo** configurar `MP_ACCESS_TOKEN_TEST`, `MP_WEBHOOK_SECRET_TEST` y `STORE_BASE_URL` con la URL HTTPS exacta de la vista previa. Registrar el webhook Order de prueba en Mercado Pago apuntando a `https://REF_NUEVO.supabase.co/functions/v1/mp-order-webhook`. Desplegar solo las tres Edge Functions en ese proyecto, con la configuración `verify_jwt = false` versionada y sus validaciones propias. No guardar secretos en GitHub ni en el frontend.

Primero ejecutar las pruebas SQL y confirmar que `/`, `/producto` y `/admin` consultan solo el proyecto nuevo. Configurar un administrador ficticio, revisar la comisión y habilitar únicamente `pieza-sandbox-001`; después activar `payments_enabled`. Realizar una compra con credenciales y comprador sandbox de Mercado Pago, comprobar el estado en `/pago` y el registro de webhook, y probar un rechazo y un reembolso. Al terminar, apagar `payments_enabled` y verificar que un reintento de creación reciba `checkout_disabled`, mientras un webhook de una orden ya iniciada todavía actualiza su estado.

La prueba SQL del proyecto nuevo y la compra sandbox son requisitos pendientes; este repositorio solo deja preparado el procedimiento.
