# Preparación para Mercado Pago Checkout Pro

## Lo que queda listo

La ficha tiene un punto de entrada estable `#btnComprar`, rotulado «Comprar ahora», deshabilitado y acompañado por `#checkoutStatus`. No tiene enlace, listener de pago ni promesa de compra completada. `#btnWhatsapp` mantiene la consulta con madera, tono, metal, acabado, extras, notas e importe estimado cuando se configure el teléfono.

Los campos históricos `mp_link`/`mpLink` no se usan para iniciar pagos. Se conserva el campo del administrador por compatibilidad con el catálogo, pero un enlace guardado allí no habilita el checkout. No se agregó ninguna credencial ni dependencia de Mercado Pago.

No se cambió la aritmética de precio base, recargos de madera, extras ni ajuste masivo. Todos los importes visibles continúan siendo estimaciones calculadas en el navegador.

## Segunda etapa (pendiente de implementar)

1. Definir qué productos/configuraciones admiten compra directa. No inferirlo de que permitan o no una nota: las piezas a medida deben seguir por consulta hasta validar su presupuesto.
2. Agregar un endpoint de servidor, por ejemplo en el Worker existente, que reciba el ID de la pieza y las opciones seleccionadas. Debe consultar Supabase y validar actividad, opciones, precio y disponibilidad; nunca aceptar el total enviado por el navegador como importe definitivo.
3. Crear la preferencia de Checkout Pro con el SDK/API oficial y guardar el Access Token exclusivamente como secreto del servidor. Usar primero credenciales de prueba oficiales, sin enlaces inventados.
4. Asociar la preferencia a un pedido persistente y contemplar idempotencia, costos de envío, moneda ARS y caducidad del presupuesto.
5. Configurar retornos de éxito/pendiente/fallo y verificar el pago del lado servidor mediante notificaciones autenticadas y consulta a Mercado Pago. La URL de retorno no prueba que un pago se haya aprobado.
6. Activar `#btnComprar` solo cuando el flujo completo esté implementado y probado. Ante error o personalización fuera del catálogo, conservar la consulta por WhatsApp.

Esta tarea no implementa el backend de pagos, no crea pedidos ni preferencias y no altera las políticas RLS.
