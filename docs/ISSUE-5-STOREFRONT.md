# Issue #5 — Tienda pública, inicio editable y legales

Estado: **preparado en el PR #2, NO publicado en sandbox ni en producción**. Las rutas legales son borradores que necesitan completar información comercial y revisión de un profesional en derecho del consumidor.

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

**NO aplicarlo sin aprobación explícita para Supabase sandbox `pacyytbscnlklyrhsshp`.** La tabla no existe todavía y el admin nuevo no se puede publicar antes de aplicar la migración, ya que añade un chequeo obligatorio de rol. El frontend público tiene fallback al contenido estático; el administrador falla de forma segura si la RPC falta.

Se verificó la sintaxis y RLS con una transacción **ROLLBACK** en sandbox: `anon` puede leer la fila pública, no escribir; `authenticated` sin rol admin no puede actualizar; `id` no puede editarse; la RPC de autorización está cerrada para anon. La tabla y la función siguen ausentes tras el ensayo.

Orden recomendado: revisar PR y pruebas → autorizar y aplicar **solo** la migración en sandbox → repetir chequeos RLS/ACL → ejecutar workflow `deploy-checkout-sandbox` desde SHA exacta con aprobación → probar en /admin → Inicio y vista pública → mantener `payments_enabled=false`.

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
