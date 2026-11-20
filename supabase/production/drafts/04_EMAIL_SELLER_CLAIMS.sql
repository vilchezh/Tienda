-- Preparación sin cobros y sin envíos. Ejecución en ambas bases: prod y sandbox.
-- Cuando el remitente sea onboarding@resend.dev, los correos a clientes
-- permanecen pendientes. Estas funciones reclaman SOLO avisos al taller.
CREATE OR REPLACE FUNCTION public.custom_quote_claim_seller_emails(p_limit integer DEFAULT 10)
RETURNS TABLE(email_id uuid, quote_id uuid, kind text, attempt integer)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
 RETURN QUERY WITH due AS (
   SELECT e.id FROM public.custom_quote_emails e
   WHERE e.recipient_kind='seller'
   AND ((e.status='pending' AND e.next_attempt_at<=now())
     OR (e.status='processing' AND e.lease_until<now() AND e.created_at>now()-interval '20 hours'))
   ORDER BY e.created_at FOR UPDATE SKIP LOCKED
   LIMIT least(greatest(coalesce(p_limit,10),1),20)
 )
 UPDATE public.custom_quote_emails e
 SET status='processing',attempts=e.attempts+1,lease_until=now()+interval '3 minutes'
 FROM due WHERE e.id=due.id
 RETURNING e.id,e.request_id,e.recipient_kind,e.attempts;
END
$function$;
REVOKE ALL ON FUNCTION public.custom_quote_claim_seller_emails(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.custom_quote_claim_seller_emails(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.checkout_claim_cancellation_seller_emails(p_limit integer DEFAULT 10)
RETURNS TABLE(email_id uuid, req_id uuid, kind text, attempt integer)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
 RETURN QUERY WITH due AS (
   SELECT e.id FROM public.checkout_cancellation_emails e
   WHERE e.recipient_type='seller'
   AND ((e.status='pending' AND e.next_attempt_at<=now())
     OR (e.status='processing' AND e.lease_until<now() AND e.created_at>now()-interval '20 hours'))
   ORDER BY e.created_at FOR UPDATE SKIP LOCKED
   LIMIT least(greatest(coalesce(p_limit,10),1),20)
 )
 UPDATE public.checkout_cancellation_emails e
 SET status='processing',attempt_count=e.attempt_count+1,lease_until=now()+interval '3 minutes'
 FROM due WHERE e.id=due.id
 RETURNING e.id,e.request_id,e.recipient_type,e.attempt_count;
END
$function$;
REVOKE ALL ON FUNCTION public.checkout_claim_cancellation_seller_emails(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.checkout_claim_cancellation_seller_emails(integer) TO service_role;
