# Presupuestos a medida — sandbox

Implementación nueva en el PR #2, rama feat/checkout-pro-orders-test. No se modificó producción.

## Experiencia
- Inicio → A medida → presupuesto.html.
- Tres pasos: proyecto, medidas/materiales/cantidad; fotos o planos opcionales; contacto y entrega.
- Código COT-AAAA-NNNNNN y enlace privado con secreto en fragmento URL. Token de 256 bits y sólo hash SHA-256 en la base.
- Administración → Pedidos → Presupuestos a medida: filtros, datos, descargas privadas, estado, notas e importe presupuestado. No genera cobro.
- Resend envía confirmación y aviso al taller sin adjuntar documentos, con logo 80 × 80 a la derecha.
- En sandbox el correo al comprador se envía únicamente si coincide con un destinatario de prueba permitido; no se envía a direcciones arbitrarias.
- Cron de envíos cada cinco minutos con clave interna en Vault.

## Seguridad
- Nueva tabla y bucket PRIVADOS, acceso administrativo protegido por RLS y tienda_security.is_admin().
- Soporta JPG, PNG, WebP y PDF. Máximo 5 archivos, 5 MB cada uno, 25 MB en total.
- Validación de cabeceras de archivos, tipo y extensión, límite de tamaño desde el servidor. No admitir ejecutables ni ZIP ni SVG.
- PDF: no hay antivirus ni escaneo de malware, por decisión del usuario. Validar firma de archivo NO GARANTIZA que sea seguro. Nunca abrir automáticamente PDF; el administrador sólo descarga como application/octet-stream.
- No dar enlaces públicos/signed URL a documentos; se accede con sesión autorizada.
- Protección antiabuso: 3 solicitudes por huella IP/email/hora, 10 solicitudes globales por día en sandbox. Los borradores no enviados se eliminan con archivos asociados tras 24 horas.
- No se usa Turnstile todavía porque no existen claves configuradas. Antes de producción instalar protección de CAPTCHA y reevaluar seguridad de archivos.
- No se mezclan presupuestos con ventas acreditadas.

## Archivos
- presupuesto.html; assets/css/quote.css; assets/js/quote.js
- assets/js/quotes-admin.js y admin.html
- Supabase Functions custom-quote-request, process-custom-quote-notifications
- Migraciones 20261118060000, 20261118061500, 20261118064000, 20261118070000 para sandbox solamente
- tests/custom-quote.test.mjs y tests/custom-quote.spec.cjs

## Pendientes de producción
- Revisión legal de privacidad y retención de documentos; definición de plazo de presupuestos.
- Verificar recepción real de emails de prueba en ambos lados, con direcciones permitidas.
- Función futura para enviar oferta final al comprador con autorización explícita; actualmente sólo guarda precio y notas, no lo envía.
- Política de análisis seguro de archivos PDF, protecciones antispam/CAPTCHA y capacidad de almacenamiento.
- NO aplicar cambios en Supabase productivo ni hacer merge a main sin autorización nueva.
