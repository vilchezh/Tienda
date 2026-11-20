# Issue #6: Seguridad previa al lanzamiento — sandbox

Alcance: PR #2 (feat/checkout-pro-orders-test), Cloudflare tienda-checkout-sandbox, Supabase pacyytbscnlklyrhsshp. No modificar main ni producción sin autorización adicional.

## Correcciones
- MFA para administradores: panel Seguridad 2FA con TOTP por QR. Tras verificar el factor, tienda_security.is_admin() requiere una sesión Supabase de nivel aal2. Antes de enrolarlo, la cuenta todavía conserva acceso para configurar MFA.
- Arrepentimiento: limitar por cf-connecting-ip en lugar de x-forwarded-for falsificable; mantener cuota por email.
- Turnstile preparado para presupuestos y arrepentimientos: site key del frontend y validación privada por Siteverify. Sin configurar las claves, Turnstile no está activo; no se debe presentar como protección completada.
- Encabezados HTTP propios de Cloudflare sandbox: nosniff, DENY, políticas de permisos/referrer. CSP en Report-Only para evitar bloquear el checkout y visor 3D sin haber probado recursos externos.
- Privacidad: incluye datos de presupuestos, planos privados sin antivirus y retención no resuelta de solicitudes finalizadas.

## Activar MFA (usuario, sandbox)
1. Entrar en /admin.html del sandbox.
2. Pulsar Seguridad 2FA, escanear QR con aplicación autenticadora y confirmar código de seis dígitos.
3. Guardar un método seguro de recuperación. Nunca compartir QR, clave ni códigos por chat.
4. Cerrar sesión y volver a entrar, verificando que el panel exige TOTP antes de mostrar clientes y pedidos.

## Turnstile (usuario)
1. En Cloudflare Turnstile crear un widget GRATIS para el hostname exacto tienda-checkout-sandbox.acero-y-escamas.workers.dev.
2. Guardar site key pública como GitHub Actions secret STORE_PREVIEW_TURNSTILE_SITE_KEY.
3. Guardar secret key como Supabase sandbox Edge Function secret TURNSTILE_SECRET; jamás ponerla en GitHub ni HTML.
4. Desplegar de nuevo cancellation-request y custom-quote-request y el Worker sandbox tras configurar ambas claves.
5. Probar un token válido, ausente, de otro hostname y vencido antes de activarlo para compradores reales.

## Bloqueos antes de producción
- Decidir retención/borrado documentado para presupuestos completados y arrepentimientos. No ejecutar borrados automáticos sin plazo aprobado.
- Revisar identidad fiscal, CUIT, domicilio, términos, entrega, garantías y privacidad con normativa argentina.
- Probar los encabezados reales, CSP e integraciones de modelo 3D y Mercado Pago.
- Verificar el bucket para imágenes públicas administradas en el sandbox, límites y permisos.
- Hacer auditoría de seguridad del proyecto Supabase de producción por separado.
- Configurar credenciales productivas y webhooks de Mercado Pago con pruebas controladas nuevas. El checkout actual usa credenciales TEST y las nuevas Edge Functions están restringidas al sandbox.
- Mantener el almacenamiento privado de planos. No hay antivirus de PDF por decisión del propietario: firma de archivo NO equivale a escaneo de malware.
- Revisar copias de seguridad, recuperación, Resend, cuotas y políticas de entrega.

Referencias:
https://supabase.com/docs/guides/auth/auth-mfa/totp
https://supabase.com/docs/guides/auth/auth-mfa
https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
https://developers.cloudflare.com/workers/static-assets/headers/