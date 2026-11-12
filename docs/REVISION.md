# Inspección y verificación · 12 de noviembre de 2026

## Punto de partida

Repositorio: `vilchezh/Tienda`, rama base `main`, commit `2332dd99eb3c0a4577a61051e43780bc5eaaeeaa`.
Rama de trabajo: `feat/tienda-premium-segura`.

La versión inspeccionada tenía tres HTML con CSS y JavaScript embebidos, un JSON histórico, un modelo GLB, texturas y logos. No había package.json, pruebas, servidor propio, archivos Wrangler ni workflows. El diseñador CAD y la Calculadora V2 no forman parte de este cambio; tampoco se modificó el proyecto separado presente en el entorno.

Dependencias originales: Supabase JS por CDN flotante `@2`, model-viewer 3.5.0 y Google Fonts. Supabase JS queda fijado en 2.119.0 (la versión resuelta durante la inspección); model-viewer se mantiene en 3.5.0. Space Grotesk se sirve localmente con licencia OFL. Playwright y axe son dependencias de desarrollo, no se descargan en la tienda.

## Hallazgos corregidos

- El catálogo recurría a `productos.json` tanto con errores como con cero filas, y la ficha lo consultaba si no encontraba la pieza en Supabase. Eso podía mostrar nuevamente productos retirados. Ambos accesos ahora fallan sin recurrir al respaldo.
- La ficha no filtraba productos activos en la consulta. Ahora aplica el mismo filtro que el catálogo, más una comprobación local.
- Había un teléfono ficticio incrustado en la ficha. Ahora la configuración central se entrega sin número y con estado visible de contacto no disponible.
- Nombre, descripción, SKU, promociones, opciones, fotos y valores de formularios se interpolaban sin escape. Los valores editables en plantillas se escapan; los campos asignados directamente usan textContent/value. Las URLs de medios se restringen a HTTPS o recursos del mismo origen local. Los colores se validan y los fondos se asignan a propiedades CSS, sin interpolar estilos HTML editables. No se permiten esquemas ejecutables. Los templates HTML restantes son estáticos o escapan explícitamente cada campo editable.
- La importación automática y manual usaba upsert. Ahora solo existe la importación manual, con validación, previsualización, confirmación escrita e INSERT de IDs nuevos ocultos.
- Se informaba eliminación exitosa aunque Supabase devolviera error. El editor ahora conserva la pieza y muestra el error.
- Las categorías ocultas podían seguir recibiendo foco. Se corrigió su visibilidad, estado expandido, salida con Escape y cierre al mover el foco.
- El logo de la ficha apuntaba a una carpeta como si fuera una imagen. Ahora usa el archivo existente correcto.

Se conservan Auth, esquema, políticas RLS, Storage, funciones de subida/reparación de GLB, filtros, promociones, edición de precios y fórmulas existentes. No se ejecutaron escrituras sobre Supabase real.

## Cloudflare y despliegue

URLs indicadas por el propietario:

- https://tienda.thiagovilchez03.workers.dev/
- https://tienda.thiagovilchez03.workers.dev/admin

**Se confirmó la conexión automática de Cloudflare Workers Builds con GitHub al publicar la rama.** Aunque el repositorio base no tenía configuración ni workflow de despliegue y su commit solo mostraba un estado antiguo de Vercel, el nuevo commit disparó `Workers Builds: tienda`. El build [153dbddc-8ab6-4e29-aaa5-f9e7de82fe05](https://dash.cloudflare.com/12f5eec2c75b9b685ff6bb06f91c8dd8/workers/services/view/tienda/production/builds/153dbddc-8ab6-4e29-aaa5-f9e7de82fe05) terminó en **failure**. GitHub expone el estado y el enlace, pero no la causa. El panel de Cloudflare también está bloqueado por la red del entorno. No se puede atribuir el fallo a una causa concreta sin sus logs. La integración de Vercel también sigue activa y generó automáticamente una preview del PR.

Las comprobaciones por curl a Workers y Supabase recibieron `403` del proxy antes de conectar al destino; Chromium devolvió `ERR_TUNNEL_CONNECTION_FAILED` tanto para la tienda como para `/admin`. No son pruebas de una caída de la tienda. La red de este entorno no permite esos dominios. También bloqueó el changelog de Supabase; se consultó la documentación de operaciones del cliente mediante el conector de Supabase.

Antes de publicar, verificar en Cloudflare Workers → tienda → Settings/Builds la conexión con `vilchezh/Tienda`, la rama de producción, el comando y directorio de publicación y el commit efectivamente desplegado. Conservar el comportamiento de `/admin` y `/producto` del despliegue existente; este repositorio contiene `admin.html` y `producto.html`. No se agregó una configuración Wrangler especulativa ni se ejecutó un despliegue manual. Las integraciones existentes reaccionaron al push de la rama; main no se fusionó ni se modificó. El nuevo workflow de GitHub ejecuta pruebas únicamente.

## Pruebas y límites

Las pruebas de navegador usan Chromium, el SDK real de Supabase 2.119.0 y model-viewer 3.5.0. Los servicios externos están interceptados y las respuestas/datos son de prueba; el modelo GLB y las texturas sí son los archivos reales del repositorio.

Cobertura: catálogo y promociones, filtros y URLs, vacío/fallo de Supabase/fallo del SDK sin respaldo; ficha ausente/oculta/fallo sin venta; intentos de inyección en catálogo, ficha y administrador; sesión/login/logout simulados mediante el SDK; edición/publicación; importación cancelada, inválida o en conflicto, omisión de IDs existentes e inserción de piezas ocultas; eliminación fallida; precios de configuración, extras, notas, galería por teclado y modelo 3D; accesibilidad WCAG A/AA con axe y ausencia de desbordamiento a 390 y 1280 px.

Las capturas son locales con datos de prueba, no capturas de producción. Las imágenes de catálogo de los fixtures son texturas de muestra para no depender de Storage remoto.

Pendiente de comprobación externa: login con una cuenta real, catálogo y fotos reales en Supabase, permisos RLS efectivos, cargas reales de archivos, la ruta `/admin` y cabeceras del Worker, rendimiento en dispositivos físicos, Safari/Firefox y realidad aumentada. No se probaron pagos porque no están implementados. Una revisión automática de accesibilidad no sustituye una revisión manual con lector de pantalla.

Resultado local final: **4 pruebas unitarias y 22 pruebas de navegador aprobadas**. `npm audit --audit-level=high` informó **0 vulnerabilidades** en las dependencias instaladas. `git diff --check` y la comprobación de sintaxis de los scripts pasaron. Se verificaron el cambio real de color/rugosidad del material `hierro` del GLB y la subida de imágenes mediante el SDK hacia un endpoint de Storage interceptado. La función de reparación GLB coincide con la original.

La misma batería también pasó en [GitHub Actions, ejecución 43125466962](https://github.com/vilchezh/Tienda/actions/runs/43125466962), con capturas subidas como artefacto. Este resultado corresponde al commit de implementación `4eb07ce2de214fd79dd580c0ca9c9704e82f9cdc`; la actualización posterior solo documenta la evidencia del build de Cloudflare.
