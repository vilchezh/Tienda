-- Postflight del ensayo de etapa 01 en PostgreSQL 17 AISLADO.
-- Falla ante cualquier alteración del catálogo, permisos inesperados, RLS ausente o pagos habilitados.
DO $check$
DECLARE obj text;
BEGIN
 IF (SELECT count(*) FROM public.productos)<>1
    OR (SELECT precio_base FROM public.productos WHERE id='producto-fixture')<>100000
    OR (SELECT activo FROM public.productos WHERE id='producto-fixture') IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Catálogo alterado';
 END IF;
 IF EXISTS(SELECT 1 FROM public.productos WHERE checkout_habilitado IS TRUE) THEN
  RAISE EXCEPTION 'Producto ficticio habilitado para cobro';
 END IF;
 IF (SELECT count(*) FROM public.stock_taller)<>1 OR
   NOT EXISTS(SELECT 1 FROM public.stock_taller WHERE id='fixtures' AND data='{"test":true}'::jsonb) THEN
  RAISE EXCEPTION 'stock_taller alterado';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM tienda_security.admins WHERE user_id='00000000-0000-4000-8000-000000000001') THEN
  RAISE EXCEPTION 'Administrador de prueba desaparecido';
 END IF;
 IF (SELECT payments_enabled FROM public.checkout_settings WHERE id='default') IS DISTINCT FROM false THEN
  RAISE EXCEPTION 'Pago real inesperadamente habilitado';
 END IF;
 FOREACH obj IN ARRAY ARRAY['checkout_settings','checkout_orders','mp_webhook_events','checkout_rate_windows',
  'checkout_order_customers','checkout_order_events','checkout_email_outbox','storefront_content'] LOOP
  IF to_regclass('public.'||obj) IS NULL
     OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class
       WHERE oid=('public.'||obj)::regclass AND relrowsecurity) THEN
   RAISE EXCEPTION 'Falta la tabla o RLS: %',obj;
  END IF;
 END LOOP;
 IF has_table_privilege('anon','public.checkout_orders','SELECT')
    OR has_table_privilege('anon','public.mp_webhook_events','SELECT')
    OR has_function_privilege('anon','public.checkout_create_order(uuid,text,jsonb,jsonb,bigint,numeric,bigint,jsonb)','EXECUTE') THEN
  RAISE EXCEPTION 'Checkout expuesto al visitante anónimo';
 END IF;
 IF NOT has_table_privilege('anon','public.checkout_settings','SELECT') THEN
  RAISE EXCEPTION 'Configuración pública inaccesible';
 END IF;
END;
$check$;
SELECT 'SQL_STAGE1_REHEARSAL_OK' AS result,
 (SELECT count(*) FROM public.productos) AS preserved_products,
 (SELECT payments_enabled FROM public.checkout_settings WHERE id='default') AS payments_enabled;
