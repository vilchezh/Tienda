-- Prueba manual de Resend SOLO por administrador autenticado.
-- 1 intento de envío cada 15 minutos por proyecto, sin datos personales ni secretos.
CREATE TABLE IF NOT EXISTS public.email_diagnostics_rate_windows (
 window_start timestamptz PRIMARY KEY,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.email_diagnostics_rate_windows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_diagnostics_rate_windows FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.email_diagnostics_rate_windows TO service_role;

CREATE OR REPLACE FUNCTION public.email_diagnostic_reserve()
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','pg_temp'
AS $function$
DECLARE chosen timestamptz;
BEGIN
 chosen := to_timestamp(floor(extract(epoch from now())/900)*900);
 INSERT INTO public.email_diagnostics_rate_windows(window_start) VALUES (chosen)
 ON CONFLICT (window_start) DO NOTHING;
 RETURN FOUND;
END
$function$;
REVOKE ALL ON FUNCTION public.email_diagnostic_reserve() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_diagnostic_reserve() TO service_role;
