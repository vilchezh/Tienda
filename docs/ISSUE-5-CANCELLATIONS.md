# Issue #5 — Botón de arrepentimiento automatizado (sandbox)

Estado: implementación en la rama del PR #2, desplegar frontend sólo por workflow sandbox. Producción y pagos sin modificar.

## Flujo
1. Página pública /arrepentimiento.html con formulario sin registro ni motivo obligatorio. Correo solicitado para seguimiento; referencia de pedido opcional.
2. Edge Function cancellation-request registra una solicitud en Supabase sandbox. Devuelve código ARR-AAAA-NNNNNN inmediatamente. No cancela ningún pedido ni mueve dinero.
3. El navegador proporciona un enlace privado de consulta: código en la URL y token aleatorio de 256 bits en el fragmento. La base sólo guarda SHA-256 del token, no el secreto. La consulta devuelve únicamente estado y fechas.
4. Se crean dos entradas de correo transaccional. process-cancellation-notifications invoca Resend, con clave de idempotencia fija por notificación, registro de resultados y reintentos programados cada cinco minutos mediante pg_cron + pg_net usando el secreto de despacho ya existente en Vault.
5. Administración (Inicio / Pedidos / Arrepentimientos) permite revisar solicitudes, guardar nota interna y cambiar estado. RLS exige tienda_security.is_admin(), además del control de sesión del panel. Un trigger registra cambios de estado.

## Seguridad
- Endpoint público con Origin permitido, límite del cuerpo y validación de datos.
- Registro atómico con UUID de envío para reintentos idempotentes y máximo cinco solicitudes por 15 minutos por huella de IP y correo, generada mediante HMAC secreto. Las huellas se purgan tras 48 horas.
- No se expone SELECT/INSERT/UPDATE público en las tablas de solicitudes, correo, límites o eventos. Las RPC internas sólo conceden EXECUTE a service_role.
- Datos de compradores no aparecen en la consulta de estado ni en respuestas a visitantes anónimos.
- No hay integración de reembolsos con Mercado Pago. El estado "approved" expresa exclusivamente aprobación administrativa; no confirma reembolso.
- Sandbox NUNCA envía correos de compradores a direcciones arbitrarias: el correo automático al comprador sólo se intenta si la dirección coincide con CANCELLATION_SANDBOX_CUSTOMER_EMAIL o con ORDER_NOTIFICATION_TO. Los demás se registran como no enviados por restricción de pruebas. El aviso al taller usa ORDER_NOTIFICATION_TO.
- En producción será necesario definir lista de destinatarios o habilitar envío real tras verificación legal y operativa, validación de identidad proporcionada y controles antiabuso de mayor escala.

## Migraciones
- 20261118022000_checkout_cancellation_requests.sql: tablas, políticas RLS, RPC, auditoría y límite atómico.
- 20261118034000_checkout_cancellation_cron.sql: cron cada cinco minutos, apunta EXCLUSIVAMENTE a pacyytbscnlklyrhsshp.
- Las migraciones se aplican manualmente en el proyecto de prueba; jamás ejecutarlas en el proyecto principal.

## Pruebas
- tests/cancellation.test.mjs cubre CORS, validación, acuse, token y no envío a correos no autorizados.
- tests/cancellation.spec.cjs cubre formulario, consulta desde enlace y gestión administrativa sin pagos.
- tests/preview.test.cjs exige que el bundle sandbox incluya el formulario y la sección administrativa.
- Prueba integrada con datos sintéticos ejemplo.invalid: endpoint devolvió código ARR-2026-000002; consulta privada devolvió received; despacho reportó un correo al taller aceptado por Resend y comprador rechazado correctamente por sandbox.
- No interpretar una confirmación de Resend como prueba de entrega en bandeja del destinatario.

## Restricciones antes de producción
- Confirmar identidad razonablemente sólo si es necesario para procesar o reembolsar; nunca condicionar la presentación inicial del pedido a registro o trámites extra.
- Completar datos legales, texto de privacidad, atención al consumidor y analizar excepciones para productos personalizados.
- Revisar los requisitos de la Disposición 954/2025 y la Disposición 3/2026 con un asesor legal.
- Habilitar y probar correos auténticos al comprador sin restricciones sandbox, verificar recepción/entregabilidad, y definir respuesta humana y plazos.
- Definir retención y borrado de solicitudes según obligaciones aplicables; no hacer purga automática sin evaluar requisitos legales.
- Solicitar autorización aparte para merge a main, publicación en Worker tienda, Supabase productivo o reembolsos.

Fuentes: https://www.argentina.gob.ar/normativa/nacional/norma-417152/texto y https://www.argentina.gob.ar/normativa/nacional/disposici%C3%B3n-3-2026-423007/texto
