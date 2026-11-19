# Conciliación SQL antes de migrar Acero y Escamas

**Estado: preparado y verificado únicamente en Supabase sandbox. No aplicado a producción.**

## Resultados comprobados
- La rama `main` no incluye las migraciones del PR #2. Esto NO demuestra que la base productiva esté vacía; podría haberse creado manualmente.
- El conector Supabase actualmente solo enumera `acero-y-escamas-test` (`pacyytbscnlklyrhsshp`). No tengo lectura autorizada del proyecto productivo desde esta conversación.
- La consulta `01_READ_ONLY_PREMIGRATION_INVENTORY.sql` fue ejecutada con éxito en sandbox. Las 11 entidades principales comprobadas están presentes; hay metadata de historial, Cron y Vault.
- El historial de `supabase_migrations.schema_migrations` en sandbox tiene timestamps de aplicación distintos a algunos nombres SQL de GitHub. **Nunca considerar el número de versión como prueba suficiente**: revisar la estructura y permisos reales.

## Paso a paso cuando llegue la etapa productiva
1. Identificar y confirmar el proyecto Supabase de la tienda original; **no cambiar secretos, datos ni funciones**.
2. En su SQL Editor, ejecutar SOLO `01_READ_ONLY_PREMIGRATION_INVENTORY.sql`. Devuelve un único JSON de metadatos, sin clientes, pagos, correos ni claves.
3. Comprobar tablas, columnas, tipos, firmas de funciones, políticas RLS y los buckets existentes. Un objeto con el nombre correcto puede tener un esquema incompatible.
4. Si existe el historial de migraciones, comparar solo nombres/versiones con el esquema observado. Si existe Cron, inspeccionar `jobname,schedule,active`; NO leer su columna `command` ni Vault.
5. Preparar diferencias concretas, copia de seguridad y restauración ensayada. Solicitar **nueva autorización** antes de cualquier SQL productivo.

## Orden de dependencias
| Etapa | Contenido | Riesgo principal |
|---|---|---|
| 0. Base | `productos`, `tienda_security.admins` y `is_admin()` | Preservar cuentas y datos; **NO ejecutar** `supabase/test/00_base.sql` en producción |
| 1. Checkout | Ajustes, pedidos, webhook, idempotencia | Pagos apagados, datos existentes y permisos |
| 2. Administración | Compradores, eventos, correos, filtros | RLS, funciones de admin y datos previos |
| 3. Portada | `storefront_content` | No reemplazar contenido existente |
| 4. Arrepentimiento | Solicitudes, eventos, emails | Cron de sandbox NO portable |
| 5. Presupuestos | Opciones, cotizaciones, archivos, RPC | Límites de sandbox y bucket privado |
| 6. Storage | Bucket público `tienda` y bucket privado de planos | No hacer públicos los PDF ni sobrescribir bucket existente |
| 7. Seguridad | MFA, Turnstile, Resend, Vault, Cron | Configuraciones definitivas posteriores |

## Migraciones bloqueadas para copia literal
Revisar el detalle completo en `migration-review.json`: son 16 archivos, todos pendientes de conciliación o adaptación. Los más delicados:
- `20261118034000_checkout_cancellation_cron.sql` y `20261118064000_custom_quote_email_cron.sql`: URLs y nombres de trabajos de pruebas. Rehacer la configuración Cron productiva posteriormente.
- `20261118060000_custom_quote_requests.sql`: mezcla esquema reutilizable con creación del bucket privado `quote-reference-sandbox`. Separar esas partes.
- `20261118061500_custom_quote_storage_read.sql`: política del bucket privado apunta al sandbox; usar la plantilla de Storage revisada para producción.
- `20261118070000_custom_quote_global_quota.sql`: límite de 10 solicitudes diarias específico del sandbox.
- `20261118072000_custom_quote_storage_budget.sql`: tope global de 200 MB para archivos de pruebas.
- `20261118082000_custom_quote_configurable_materials.sql`: redefine la función de creación de presupuestos y hereda cuotas de pruebas.
- `20261118120000_admin_mfa_stepup.sql`: requiere recuperación de cuenta TOTP antes de activar en producción.
- `20261118130000_storefront_public_storage.sql`: puede reutilizarse solo después de conciliar si el bucket `tienda` y sus políticas ya existen.

## Reglas de seguridad antes de autorizar producción
- Copias de seguridad/restauración verificadas, informes RLS y pruebas negativas de acceso anónimo/no admin.
- Sin imports de `supabase/test/`, `productos-preview.json`, pedidos ficticios, datos de clientes de prueba ni enlaces sandbox.
- Checkout con `payments_enabled=false`; el cobro real se autoriza por separado.
- Storage privado para planos/PDF y URL HTTPS distinta; no antivirus contratado (decisión actual).
- Revisar límites adecuados a ventas reales, conservación de datos y cumplimiento comercial argentino.
- Probar un procedimiento de reversión de Worker y desactivación de compras ante incidentes.
- Ninguna migración o publicación productiva sin permiso específico del propietario.

## Comprobaciones automáticas
`tests/release-migrations.test.cjs` verifica que todas las migraciones de la rama estén clasificadas y que la consulta de inventario no realice operaciones SQL de escritura. Está incluida en `npm run test:unit`.

La plantilla `PRIVATE-QUOTES-STORAGE.sql.template` NO se ejecuta automáticamente. El archivo `supabase/config.toml` sigue apuntando al proyecto de pruebas hasta la etapa de migración autorizada.
