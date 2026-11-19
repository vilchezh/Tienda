# Auditoría comparativa de Supabase — 19/11/2026

**Alcance:** consultas de solo lectura en dos organizaciones vinculadas: producción `ivyagavbhsyzvikzhmhe` (`tienda/calculadora de taller`) y sandbox `pacyytbscnlklyrhsshp` (`acero-y-escamas-test`). No se ejecutaron DDL, migraciones, despliegues, cambios en secretos ni operaciones de escritura sobre producción.

## Resumen y decisión
**NO fusionar el PR #2 ni aplicar las 16 migraciones directamente a producción.** La base original contiene datos y objetos propios de la tienda y de la calculadora. Se debe ejecutar una migración incremental con parámetros de producción, pagos desactivados, verificación de backups y control de permisos.

## Inventario verificado
| Metadato | Producción | Sandbox |
|---|---|---|
| Tablas de negocio en `public` | 2: `productos`, `stock_taller` | 19 |
| Productos | 5 activos | 1 producto de prueba activo |
| Administradores registrados | 1 | 1 |
| Archivos en bucket público `tienda` | 15 | 0 |
| Bucket `tienda` | público; sin tope ni MIME definidos | público, 30 MiB, JPG/PNG/WebP/GLB |
| Bucket de planos privados | ausente | `quote-reference-sandbox`, privado, 5 MiB por archivo |
| Edge Functions | 0 | 10 (incluye una de diagnóstico TEST, no publicar esa en producción) |
| `pg_cron` / `pg_net` | No instaladas | Instaladas |
| RLS catálogo | Habilitada | Habilitada |
| Función `tienda_security.is_admin()` | Existe; consulta tabla privada `admins` | Existe; también comprueba TOTP cuando está verificado |
| `supabase_migrations.schema_migrations` | No existe | Existe |

De las 22 relaciones seleccionadas por el inventario, en producción están `public.productos`, `tienda_security.admins`, `storage.buckets` y `storage.objects` (4 presentes), frente a 22 presentes en sandbox. En producción hay 1 de las 20 funciones de negocio/datos seleccionadas, `tienda_security.is_admin()`, y las demás pertenecen al PR #2 o a configuraciones de prueba.

## Compatibilidad del catálogo
- **Conservar todos los registros** de `public.productos`: 5 filas, 5 activas; precios no negativos, enteros y representables como enteros de JavaScript. La validación actual no exige alterar el tipo.
- **Diferencia importante:** `public.productos.precio_base` es `numeric` en producción y `bigint` en sandbox. No modificar el tipo sin probar todos los cálculos y la edición admin; los datos actuales son compatibles.
- En producción la columna `activo` permite NULL (no hay actualmente valores NULL), los campos JSONB para opciones permiten NULL (no hay actualmente filas con valores NULL en esas columnas) y existe `updated_at`. Respetar esas diferencias al escribir migraciones; no sustituir tabla con `supabase/test/00_base.sql`.
- La columna `checkout_habilitado` no existe en producción. La migración inicial del checkout la agrega con valor por defecto **false**, adecuado para instalación apagada.
- `public.stock_taller` contiene `id text`, `data jsonb`, `updated_at timestamptz` y tiene RLS con política `Stock administracion exclusiva` para administradores. **Excluirla expresamente del alcance de cualquier reemplazo, restauración selectiva o seed de la tienda.** No se inspeccionó el contenido de esa tabla.

## Archivos y almacenamiento
- El bucket productivo `tienda` contiene 15 objetos: 6 GLB, 7 JPG, 1 PNG y 1 WebP. Ningún objeto almacenado supera 30 MiB según su metadata. Dos GLB figuran con MIME `application/octet-stream` y cuatro con `model/gltf-binary`.
- No establecer límites de MIME de forma indiscriminada: comprobar compatibilidad con 3D, subidas y objetos legados. Ajustar política de nuevas subidas con nombres de carpetas, extensiones y MIME, sin borrar ni mover objetos preexistentes.
- En producción el bucket ya existe. El `INSERT ... ON CONFLICT DO NOTHING` de la migración `20261118130000_storefront_public_storage.sql` **no cambia** sus límites actuales; la política nueva también debe conciliarse con las políticas existentes.
- El bucket privado de presupuestos debe crearse bajo un nombre productivo distinto; nunca copiar referencias del sandbox.

## Seguridad verificada (no es una prueba de penetración)
- Catálogo `productos`: RLS habilitada; política pública solo para `activo IS TRUE`; edición del administrador condicionada a `tienda_security.is_admin()`. La tabla `stock_taller` también usa autorización administrativa.
- `tienda_security.admins` mantiene RLS habilitada y sin política pública, un comportamiento esperado para la tabla privada.
- `tienda_security.is_admin()` productiva es `SECURITY DEFINER`, usa `auth.uid()` y tiene ejecución para autenticados, no para anónimos. El MFA con requisito AAL2 **no está aplicado aún en producción**.
- La tabla `productos` muestra concesiones SQL de INSERT/UPDATE a `anon`, pero la RLS no tiene política de escritura para ese rol. Por defensa en profundidad, revisar y posiblemente revocar concesiones innecesarias con prueba de regresión previa. **No se ha demostrado escritura anónima efectiva.**
- Storage de producción permite lectura pública solo del bucket `tienda`; alta, actualización y eliminación se restringen por política RLS a administradores. La política actual no impone rutas, tamaños ni tipos de archivo.
- Aviso Supabase de seguridad: protección de contraseñas filtradas desactivada en **ambos proyectos**. Revisar si está disponible en el plan, antes del lanzamiento.
- Aviso Supabase de rendimiento: dos políticas permisivas SELECT en `productos` para autenticados. No prueba una vulnerabilidad; puede optimizarse después.

## Dependencias ausentes en producción
- Las nuevas tablas de pedidos, clientes, eventos, correos, tasas de solicitudes, arrepentimientos, presupuestos y contenido de portada no están presentes.
- No hay ninguna de las 9 Edge Functions productivas necesarias del PR #2. La función `mp-order-diagnostic-test` es exclusivamente de sandbox y no debe migrarse.
- Las extensiones `pg_cron` y `pg_net` no están instaladas. Su habilitación requiere un cambio productivo autorizado y un ensayo de tareas programadas con claves separadas.
- La producción no tiene historial registrado en `supabase_migrations.schema_migrations`; es fundamental comprobar objetos existentes y no fiarse de versiones de archivos solamente.
- Deben adaptarse las migraciones que contienen URL/bucket/Cron de sandbox y cuotas globales de 10 presupuestos/día y 200 MiB; esos límites **NO** quedan aprobados para producción.

## Orden recomendado (requiere autorización posterior)
1. Confirmar respaldo/restauración de producción y una ventana de implementación. Conservar datos y stock del taller.
2. Preparar migración incremental desde el inventario real; ensayar compatibilidad del catálogo y funciones con tipos productivos. No sembrar productos ficticios ni limpiar datos.
3. Revisar/fortalecer Storage, sin borrar objetos actuales y sin impedir modelos GLB legados.
4. Habilitar extensiones y migrar tablas/RLS/funciones; mantener `payments_enabled=false`.
5. Crear depósito privado, Vault/Cron y desplegar Edge Functions seleccionadas sin claves sandbox; probar errores, permisos y retornos.
6. Activar MFA/Turnstile/Resend en el entorno final y verificar entregas/retención.
7. Autorizar por separado las pruebas de Mercado Pago reales y, solo después, habilitar ventas.

## Material técnico ya preparado
- [`supabase/production/01_READ_ONLY_PREMIGRATION_INVENTORY.sql`](../supabase/production/01_READ_ONLY_PREMIGRATION_INVENTORY.sql): consulta validada en ambos proyectos, sin operaciones de escritura.
- [`supabase/production/migration-review.json`](../supabase/production/migration-review.json): clasificación de las 16 migraciones versionadas del PR #2.
- [`supabase/production/README.md`](../supabase/production/README.md): protocolo de conciliación y pruebas.

**Acciones ejecutadas en esta auditoría:** consultas SQL de metadatos y recuentos, avisos de seguridad/rendimiento y listado de Edge Functions. Ningún dato personal de compradores fue leído ni modificado. No se ha publicado nada a producción.
