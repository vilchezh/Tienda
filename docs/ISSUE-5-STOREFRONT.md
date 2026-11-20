# Issue #5 — Tienda pública, inicio editable y legales

Estado verificado el 19/11/2026: **la migración de contenido de portada ya está aplicada en Supabase sandbox** (migración registrada como `20261118003315_storefront_home_editor`). La publicación del frontend del Issue #5 no fue verificada en esta revisión. **El editor manual queda pausado por decisión del propietario**; no desplegarlo ni volver a ejecutar la migración por rutina. Producción permanece fuera de alcance. Las rutas legales son borradores que necesitan completar información comercial y revisión de un profesional en derecho del consumidor.

## Cambios preparados
- Para **envíos a domicilio sin costo total confirmado**, el navegador bloquea compra directa y el servidor rechaza incluso solicitudes manuales (`shipping_quote_required`) antes de crear o reutilizar una orden Mercado Pago. Se conserva retiro a coordinar y consulta de envío. Antes de habilitar delivery directo habrá que implementar cotización firme de envío incluida en el total servidor.
- Precio final únicamente en catálogo y producto, incluidos materiales, extras y comisión según la configuración seleccionada. El administrador conserva el detalle de fórmula y el servidor sigue recalculando la orden, sin confiar en un total enviado por el navegador.
- Logo del pangolín con fondo transparente aprobado, en portada, encabezado y ficha.
- Barra de precio sticky en el configurador, con precio visible durante la elección de materiales. Revisar en 320 px, 390 px y escritorio antes de publicar.
- El enlace a Administración se quitó del pie público: **esto no es un control de acceso**. El acceso exige Supabase Auth más `public.storefront_admin_authorized()`, que consulta la lista de admins de `tienda_security`. RLS impide la edición por terceros.
- Editor del inicio: título, subtítulo, descripción, imagen (URL HTTPS o archivo en Supabase Storage), orden/visibilidad de encabezado, destacados, catálogo y sección a medida. Carrusel de hasta 12 productos **manualmente seleccionados**, siempre filtrando productos visibles.
- «Más vendidos» **diferido**: no usar órdenes ficticias del sandbox ni contar pedidos `created`; considerar solo `processed` de producción cuando esté validada la conciliación y sin exponer datos personales.

## Migración segura
Archivo: `supabase/migrations/20261117235800_storefront_home_editor.sql`.

**Ya aplicado en sandbox `pacyytbscnlklyrhsshp`: no volver a ejecutarlo.** La verificación de solo lectura del 19/11/2026 confirmó que existen `public.storefront_content` (RLS habilitada) y la RPC `public.storefront_admin_authorized()`. La tabla y la RPC aún no deben trasladarse a producción sin seguir el plan de migración, respaldo y autorización correspondiente. El frontend público mantiene el fallback al contenido estático y el administrador falla de forma segura cuando falta la RPC.

La verificación inicial con **ROLLBACK** probó que `anon` podía leer la fila pública sin escribir, que un usuario autenticado sin rol administrador no podía editar, que `id` no era editable y que la RPC no permitía acceso anónimo. **Esos resultados pertenecen al ensayo anterior**; el 19/11 se confirmó adicionalmente la existencia real de la tabla y la función, sin modificar datos. Antes de cualquier futura publicación del editor, repetir pruebas actuales de permisos.

Orden recomendado si se retoma el editor en el futuro: revisar PR y pruebas → repetir chequeos RLS/ACL del esquema ya instalado → obtener aprobación específica para ejecutar workflow `deploy-checkout-sandbox` desde SHA exacta → probar /admin → Inicio y vista pública → mantener `payments_enabled=false`. **Por ahora no ejecutar ese despliegue.**

## Legales: borrador no apto para ventas reales
Archivos `privacidad.html`, `terminos.html` y `arrepentimiento.html`. Hay un enlace destacado al Botón de Arrepentimiento desde el primer acceso al inicio, sin necesidad de cuenta.

La Disposición 954/2025 requiere además confirmar un **código identificatorio de solicitud dentro de las 24 horas**, por el mismo medio. La versión inicial abre `mailto:` para que el comprador redacte una solicitud, pero **no crea ni registra automáticamente un expediente o código**. No dar esta parte por cumplida para producción sin una implementación y validación de la recepción y la respuesta.

La Disposición 3/2026 admite mecanismos razonables de corroboración de identidad que no impliquen trabas injustificadas. El CCyC art. 1116 contiene excepciones para bienes claramente personalizados, que no anulan otros derechos y deben analizarse caso por caso.

**Falta que el titular aporte/verifique:** razón social o nombre del proveedor, CUIT, domicilio, medios y horario de atención, costos/zonas/plazos de envío y retiro, garantías comerciales adicionales si las hubiera, procedimiento de reclamos, garantía de emisión de código de solicitud, registro/aviso legal de la base de datos y revisión del plazo de retención (365 días). No inventar datos fiscales ni plazos.

Fuentes oficiales:
- https://www.argentina.gob.ar/normativa/nacional/norma-417152/texto
- https://www.argentina.gob.ar/normativa/nacional/disposici%C3%B3n-3-2026-423007/texto
- https://www.argentina.gob.ar/normativa/nacional/235975/texto
- https://www.argentina.gob.ar/normativa/nacional/64790/actualizacion

## Alcance
**NO** se alteran producción, Worker `tienda`, Supabase productivo `ivyagavbhsyzvikzhmhe` ni se activa el checkout. No hay migraciones aplicadas desde el Issue #5 hasta nueva aprobación. Los flujos y pruebas anteriores se mantienen.
