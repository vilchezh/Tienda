-- Autorización interna de envío: el token se genera dentro de Supabase Vault.
-- Nunca imprimirlo, copiarlo a GitHub ni mostrarlo en el panel público.
-- Ejecutar en producción DESPUÉS de revisar esquema.
DO $setup$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name='storefront-seller-dispatch-token') THEN
    PERFORM vault.create_secret(
      encode(extensions.gen_random_bytes(32),'hex'),
      'storefront-seller-dispatch-token',
      'Token privado para pg_cron -> process-seller-notifications (no para clientes)'
    );
  END IF;
END
$setup$;

CREATE OR REPLACE FUNCTION public.storefront_validate_seller_dispatch(p_token text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','pg_temp'
AS $body$
DECLARE expected text;
BEGIN
 IF p_token IS NULL OR length(p_token)<>64 OR p_token !~ '^[a-f0-9]{64}$'
  THEN RETURN false;
 END IF;
 SELECT decrypted_secret INTO expected
 FROM vault.decrypted_secrets
 WHERE name='storefront-seller-dispatch-token'
 LIMIT 1;
 RETURN expected IS NOT NULL AND expected=p_token;
END;
$body$;
REVOKE ALL ON FUNCTION public.storefront_validate_seller_dispatch(text)
 FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.storefront_validate_seller_dispatch(text)
 TO service_role;
