# Plan de instalación SQL productiva — BORRADOR, SIN EJECUCIÓN

**Proyecto destino:** `ivyagavbhsyzvikzhmhe` (`tienda/calculadora de taller`). **Origen del código:** PR #2, `feat/checkout-pro-orders-test`. Este plan **no autoriza** modificar Supabase ni Cloudflare producción.

## Ejecución de etapa 1 — 19/11/2026

**REALIZADA EN PRODUCCIÓN, SIN RESPALDO COMPLETO, CON AUTORIZACIÓN EXPLÍCITA DEL PROPIETARIO** para aceptar ese riesgo. Se aplicó únicamente el archivo `01_checkout_admin_NO_EJECUTAR.sql` previamente revisado, por Supabase MCP `apply_migration`, con nombre `production_stage1_checkout_admin_20261119`. Supabase confirmó `success: true` y registró la versión `20261119191949`.

**Verificación SQL posterior (producción `ivyagavbhsyzvikzhmhe`):**
- 5 productos (5 activos), 1 admin, 15 objetos de Storage `tienda`; `stock_taller` conserva 0 filas.
- `payments_enabled=false`, 0 productos con `checkout_habilitado=true`, 0 pedidos; comisión inicial 0.00.
- 8 tablas de la etapa con RLS, `storefront_admin_authorized()` y `checkout_create_order(...)` presentes; la RPC de creación de órdenes solo es ejecutable por `service_role`, no por `anon` ni `authenticated`.
- Los avisos de seguridad posteriores son: RLS sin políticas en `checkout_rate_windows` y `tienda_security.admins` (sin acceso público pretendido) y protección de contraseñas filtradas desactivada.
- Sandbox conservado e inspeccionado por lectura. **No se desplegaron Edge Functions, cron, Worker, frontend ni pagos.**
- Se realizó la ejecución **sin respaldo completo recuperable**, por decisión expresa del propietario; esto no convierte el sandbox en respaldo de producción.

**Próximas etapas:** SQL 02 y 03 siguen pendientes de revisión, límites y autorización. No volver a ejecutar la etapa 01 ni fusionar PR #2 a `main` como resultado de esta acción.

---

## Estado original de la autorización y bloqueo de respaldo (histórico, previo a la ejecución)

- El propietario autorizó la **etapa 1** (checkout y administración exclusivamente, con pagos desactivados), condicionada a poder restaurar la base y a un ensayo aislado.
- El ensayo aislado de la etapa 1 se ejecutó con éxito en GitHub Actions: [PostgreSQL 17, datos falsos](https://github.com/vilchezh/Tienda/actions/runs/44463020354). Es un ensayo de compatibilidad; **no equivale a restaurar un respaldo real del proyecto**.
- El proyecto Supabase original pertenece a la organización **Free**, confirmada por el conector. Supabase no ofrece backups diarios automáticos en el plan Free: [Database Backups](https://supabase.com/docs/guides/platform/backups).
- **Bloqueo activo:** no se dispone por las herramientas conectadas de un respaldo productivo comprobado y restaurable. **No ejecutar la etapa 1 todavía**, aunque el SQL y el ensayo aislado estén aprobados.
- Para desbloquear: generar un respaldo lógico del proyecto original (roles, schema y datos) siguiendo [supabase db dump](https://supabase.com/docs/reference/cli/supabase-db-dump), guardarlo fuera de este repositorio, verificar los archivos y ensayar una restauración **en un entorno separado**. La CLI usa contenedores Docker para `db dump`; no subir el respaldo a GitHub, ni pegar cadenas de conexión o contraseñas en chats.
- El conector disponible no incluye una función para generar/listar/verificar backups del proyecto. Crear otra instancia o branch Supabase puede implicar cargos y requiere autorización adicional.
- Repetir las comprobaciones de solo lectura del proyecto original inmediatamente antes de aplicar la etapa 1, y volver a confirmar que el PR y la rama `main` no cambiaron.

## Objetivo
Instalar la funcionalidad del checkout, administrador, arrepentimientos y presupuestos **sin sustituir la tienda publicada**. El catálogo productivo tiene 5 productos activos, una cuenta admin y 15 objetos en Storage `tienda`; `stock_taller` no se utiliza actualmente. El usuario permite descartar productos de prueba, pero **no hay razón técnica para eliminarlos ahora** y se preservarán hasta confirmar el nuevo sistema.

El campo `productos.precio_base` es `numeric` en producción y `bigint` en sandbox. Los cinco precios productivos observados son enteros, no negativos y seguros en JavaScript. Los borradores **no cambian el tipo ni recrean** `public.productos`.

## Archivos preparados
| Archivo | Contenido y condición de ejecución |
|---|---|
| `drafts/01_checkout_admin_NO_EJECUTAR.sql` | Checkout Pro, pedidos, admin, avisos, auditoría, portada y privilegios. Aborta si detecta tablas existentes/instalación parcial, precios incompatibles, RLS ausente o falta de admin. Debe dejar `payments_enabled=false` y `checkout_habilitado=false`. |
| `drafts/02_presupuestos_arrepentimiento_REQUIERE_LIMITES.sql` | Solicitudes, correo en cola y opciones de presupuestos. **No es SQL ejecutable todavía:** contiene `__QUOTE_MAX_DAILY__` y `__QUOTE_STORAGE_MAX_BYTES__`, pendientes de valores productivos aprobados. No copia `quote-reference-sandbox`. |
| `drafts/03_storage_privado_NO_EJECUTAR.sql` | Depósito `quote-reference` **privado**, 5 MB por archivo, acceso a metadatos para admin con RLS. Falla si existe ese bucket; no modifica `tienda`. |
| `drafts/04_verificacion_READ_ONLY.sql` | Consulta para después de instalar las tres etapas. Comprueba número de productos/admin, existencia de `stock_taller`, RLS de tablas, buckets y pagos desactivados. |
| `drafts/source-lock.json` | Huellas SHA del contenido de las 11 migraciones SQL reutilizadas y lista explícita de 5 excluidas. Si se modifica una fuente, las pruebas obligan a revisar los borradores. |

**Los SQL 01, 02 y 03 son borradores para revisión humana, no migraciones listas para aplicar automáticamente.** Los dos primeros se agrupan transaccionalmente para evitar una instalación incompleta por error. El bloqueo preventivo ante objetos ya existentes obliga a conciliar cualquier instalación parcial y evita sobrescribir tablas.

## Qué se excluye a propósito
- `20261118034000_checkout_cancellation_cron.sql`: job de pruebas con URL y secreto de sandbox.
- `20261118064000_custom_quote_email_cron.sql`: cron de presupuestos de pruebas.
- `20261118061500_custom_quote_storage_read.sql`: política antigua que apunta al depósito privado de sandbox; reemplazada por la etapa 03.
- `20261118120000_admin_mfa_stepup.sql`: MFA productivo solo cuando exista recuperación administrativa y se pueda probar.
- `20261118130000_storefront_public_storage.sql`: el bucket `tienda` **ya existe** en producción y hay 15 objetos; sus políticas/permisos se deben conciliar por separado sin romper imágenes ni GLB heredados.
- `supabase/test/00_base.sql`, seeds, pedidos, productos y archivos ficticios **jamás** forman parte del paquete.

## Pendientes de configuración no duplicables
1. **Cuota de solicitudes de presupuestos por día** y **tope agregado de almacenamiento**. Los 10/día y 200 MB actuales son específicos del sandbox. Decidir valores según capacidad y plan gratuito; sin ellos el SQL de etapa 02 no puede ejecutarse.
2. Verificar que el producto pueda publicarse con el tipo `numeric` existente y que el backend maneje precios correctamente sin modificar esa columna. Los valores actuales superaron el control de enteros.
3. Copia de seguridad/restauración real del proyecto productivo y comprobación de las políticas existentes. No alcanza con un backup no probado.
4. Preparar y aprobar por separado `pg_cron`, `pg_net` (ausentes en producción), secretos Vault y tareas de correo productivas.
5. Configurar Turnstile, MFA, Resend, dominio productivo y credenciales Mercado Pago LIVE. **No** habilitar pagos reales junto con la migración SQL.
6. Realizar ensayos de roles anónimo/no admin, RLS, subidas a Storage, checkout, correos y estados de pedidos antes de pasar el PR a `main`.

## Procedimiento cuando se autorice producción
1. Confirmar con el responsable el proyecto ID, la ventana de mantenimiento y la estrategia de respaldo. No ejecutar más de una etapa a la vez.
2. Revisar el inventario `../01_READ_ONLY_PREMIGRATION_INVENTORY.sql` de solo lectura y comprobar que no aparecieron objetos nuevos desde el 19/11/2026.
3. Fijar los límites productivos; sustituir ambos marcadores SOLO en el borrador 02 validado, revisar la función SQL completa y generar una versión revisada/firmada.
4. Aplicar la etapa 01. Ejecutar comprobaciones, especialmente `payments_enabled=false`, administrador y catálogo intactos. Si falla, detenerse; no seguir con etapas posteriores.
5. Aplicar etapa 02, ejecutar comprobaciones RLS y carga de presupuestos. Probar permisos negativos antes de exponer el formulario.
6. Aplicar etapa 03, verificar que el depósito privado no sea público y que `tienda`/GLB anteriores funcionan.
7. Recién entonces preparar/validar Edge Functions, correos, extensiones, Cron, Turnstile, MFA y frontend productivo. Cada servicio requiere su propia validación, y los pagos permanecerán desactivados hasta autorización adicional.

**Reversión:** cada etapa SQL está envuelta en una transacción para errores durante esa etapa, pero **no existe un rollback automático entre etapas ya confirmadas**, ni garantiza recuperar funciones o datos modificados posteriormente. Debe definirse un plan de restauración de base probado antes de ejecutar.

## Verificación del repositorio
`npm run test:unit` incluye `tests/production-sql-drafts.test.cjs`: compara las huellas del SQL original, valida que se excluyeron SQL específicos del sandbox, exige bloqueo de límites sin definir y verifica que no aparezcan operaciones de eliminación de productos o cambios en `stock_taller`.

**Autorización necesaria para ejecutar cualquier etapa en producción:** nueva autorización específica del propietario, después de los respaldos y las pruebas de seguridad. Sin autorización solo se trabaja en GitHub/sandbox.
