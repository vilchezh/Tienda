-- Verificación posterior a las ETAPAS 01, 02 y 03. SOLO LECTURA.
-- No presenta datos de clientes, pedidos, ni secretos.
SELECT pg_catalog.jsonb_pretty(jsonb_build_object(
 'products_count',(SELECT count(*) FROM public.productos),
 'active_products',(SELECT count(*) FROM public.productos WHERE activo IS TRUE),
 'administrators',(SELECT count(*) FROM tienda_security.admins),
 'stock_taller_exists',to_regclass('public.stock_taller') IS NOT NULL,
 'payments_enabled',(SELECT payments_enabled FROM public.checkout_settings WHERE id='default'),
 'checkout_enabled_products',(SELECT count(*) FROM public.productos WHERE checkout_habilitado IS TRUE),
 'rls_tables',(SELECT jsonb_agg(jsonb_build_object('name',c.relname,'rls',c.relrowsecurity)
   ORDER BY c.relname) FROM pg_catalog.pg_class c
   JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname IN(
    'checkout_settings','checkout_orders','checkout_order_customers',
    'checkout_email_outbox','checkout_rate_windows','checkout_cancellation_requests',
    'checkout_cancellation_rate','custom_quote_requests','custom_quote_files',
    'custom_quote_rate','custom_quote_options','storefront_content')),
 'buckets',(SELECT jsonb_agg(jsonb_build_object(
   'id',b.id,'public',b.public,'file_limit',b.file_size_limit,
   'allowed_types',b.allowed_mime_types) ORDER BY b.id)
  FROM storage.buckets b WHERE b.id IN ('tienda','quote-reference'))
)) AS release_verification;
