-- ACERO Y ESCAMAS — INVENTARIO PREMIGRACION: SOLO LECTURA
-- Ejecutar en el SQL Editor del proyecto que se quiera inspeccionar.
-- No instala tablas, no cambia RLS, no accede a datos de clientes y no lee secretos.
-- Devuelve un solo JSON de metadatos para comparar con el PR #2.
-- IMPORTANTE: presencia NO equivale a compatibilidad; también verificar firmas,
-- columnas, políticas y datos existentes antes de autorizar migraciones.
WITH expected_relations(schema_name,object_name) AS (
 VALUES
 ('public','productos'),('tienda_security','admins'),
 ('public','checkout_settings'),('public','checkout_orders'),
 ('public','checkout_order_customers'),('public','checkout_order_events'),
 ('public','checkout_email_outbox'),('public','mp_webhook_events'),
 ('public','checkout_rate_windows'),('public','storefront_content'),
 ('public','checkout_cancellation_requests'),('public','checkout_cancellation_rate'),
 ('public','checkout_cancellation_emails'),('public','checkout_cancellation_events'),
 ('public','custom_quote_requests'),('public','custom_quote_files'),
 ('public','custom_quote_rate'),('public','custom_quote_emails'),
 ('public','custom_quote_events'),('public','custom_quote_options'),
 ('storage','buckets'),('storage','objects')
),
relations AS (
 SELECT e.*,c.oid,c.relkind,c.relrowsecurity,c.relforcerowsecurity
 FROM expected_relations e
 LEFT JOIN pg_catalog.pg_namespace ns ON ns.nspname=e.schema_name
 LEFT JOIN pg_catalog.pg_class c ON c.relnamespace=ns.oid
  AND c.relname=e.object_name AND c.relkind IN ('r','p','v','m')
),
expected_columns(schema_name,object_name,column_name) AS (
 VALUES
 ('public','productos','id'),('public','productos','activo'),
 ('public','productos','checkout_habilitado'),
 ('public','checkout_settings','payments_enabled'),
 ('public','checkout_settings','commission_percent'),
 ('public','checkout_orders','client_request_id'),
 ('public','checkout_orders','payment_status'),
 ('public','checkout_orders','mp_order_id'),
 ('public','checkout_orders','manufacturing_status'),
 ('public','checkout_orders','total_amount'),
 ('public','checkout_orders','currency'),
 ('public','checkout_order_customers','email'),
 ('public','storefront_content','hero_title'),
 ('public','checkout_cancellation_requests','customer_email'),
 ('public','custom_quote_requests','token_hash'),
 ('public','custom_quote_requests','quote_preferences'),
 ('public','custom_quote_requests','delivery'),
 ('public','custom_quote_files','storage_path'),
 ('public','custom_quote_options','metal_materials'),
 ('public','custom_quote_options','wood_materials')
),
cols AS (
 SELECT e.schema_name||'.'||e.object_name||'.'||e.column_name AS name,
        a.attname IS NOT NULL AS present,
        CASE WHEN a.attname IS NOT NULL
         THEN pg_catalog.format_type(a.atttypid,a.atttypmod) END AS sql_type
 FROM expected_columns e
 LEFT JOIN pg_catalog.pg_namespace ns ON ns.nspname=e.schema_name
 LEFT JOIN pg_catalog.pg_class c ON c.relnamespace=ns.oid AND c.relname=e.object_name
 LEFT JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid
  AND a.attname=e.column_name AND a.attnum>0 AND NOT a.attisdropped
),
expected_routines(schema_name,routine_name) AS (
 VALUES
 ('tienda_security','is_admin'),('public','rls_auto_enable'),
 ('public','checkout_finalize_creation'),('public','checkout_record_verified_order'),
 ('public','checkout_take_rate_slot'),('public','checkout_create_order'),
 ('public','checkout_admin_list_orders'),('public','checkout_claim_notifications'),
 ('public','checkout_due_notification_orders'),('public','checkout_expire_uncertain_notifications'),
 ('public','checkout_purge_expired_customer_data'),
 ('public','checkout_register_cancellation'),('public','checkout_claim_cancellation_emails'),
 ('public','custom_quote_create'),('public','custom_quote_create_v2'),
 ('public','custom_quote_add_file'),('public','custom_quote_finish'),
 ('public','custom_quote_claim_emails'),('public','custom_quote_option_list_valid'),
 ('public','storefront_admin_authorized')
),
routines AS (
 SELECT e.*,p.oid,p.prosecdef,
        CASE WHEN p.oid IS NOT NULL
         THEN pg_catalog.pg_get_function_identity_arguments(p.oid) END AS arguments,
        CASE WHEN p.oid IS NOT NULL
         THEN pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') END AS anon_execute,
        CASE WHEN p.oid IS NOT NULL
         THEN pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE') END AS authenticated_execute
 FROM expected_routines e
 LEFT JOIN pg_catalog.pg_namespace ns ON ns.nspname=e.schema_name
 LEFT JOIN pg_catalog.pg_proc p ON p.pronamespace=ns.oid AND p.proname=e.routine_name
),
policies AS (
 SELECT p.schemaname,p.tablename,p.policyname,p.roles,p.cmd,p.qual,p.with_check
 FROM pg_catalog.pg_policies p
 JOIN expected_relations e ON e.schema_name=p.schemaname AND e.object_name=p.tablename
),
expected_buckets(bucket_id) AS (VALUES ('tienda'),('quote-reference-sandbox'),('quote-reference')),
bucket_inventory AS (
 SELECT e.bucket_id,b.id IS NOT NULL AS present,b.public,
        b.file_size_limit,b.allowed_mime_types
 FROM expected_buckets e LEFT JOIN storage.buckets b ON b.id=e.bucket_id
)
SELECT pg_catalog.jsonb_pretty(pg_catalog.jsonb_build_object(
 'kind','READ_ONLY_PREMIGRATION',
 'observed_at',now(),
 'database',current_database(),
 'server_version',current_setting('server_version'),
 'migration_history_table_present',to_regclass('supabase_migrations.schema_migrations') IS NOT NULL,
 'cron_table_present',to_regclass('cron.job') IS NOT NULL,
 'vault_metadata_present',to_regclass('vault.secrets') IS NOT NULL,
 'relations',coalesce((SELECT jsonb_agg(jsonb_build_object(
    'name',schema_name||'.'||object_name,'present',oid IS NOT NULL,
    'kind',relkind,'rls',relrowsecurity,'force_rls',relforcerowsecurity
  ) ORDER BY schema_name,object_name) FROM relations),'[]'::jsonb),
 'critical_columns',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.name)
    FROM cols c),'[]'::jsonb),
 'routines',coalesce((SELECT jsonb_agg(jsonb_build_object(
   'name',schema_name||'.'||routine_name,'present',oid IS NOT NULL,
   'signature',arguments,'security_definer',prosecdef,
   'anon_can_execute',anon_execute,'authenticated_can_execute',authenticated_execute
  ) ORDER BY schema_name,routine_name,arguments) FROM routines),'[]'::jsonb),
 'policies',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.schemaname,p.tablename,p.policyname)
    FROM policies p),'[]'::jsonb),
 'buckets',coalesce((SELECT jsonb_agg(to_jsonb(b) ORDER BY b.bucket_id)
    FROM bucket_inventory b),'[]'::jsonb),
 'event_triggers',coalesce((
   SELECT jsonb_agg(jsonb_build_object(
     'name',e.evtname,'event',e.evtevent,'enabled',e.evtenabled,
     'routine',n.nspname||'.'||p.proname
   ) ORDER BY e.evtname)
   FROM pg_catalog.pg_event_trigger e
   JOIN pg_catalog.pg_proc p ON p.oid=e.evtfoid
   JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 ),'[]'::jsonb),
 'business_triggers',coalesce((
   SELECT jsonb_agg(jsonb_build_object(
     'table',r.schema_name||'.'||r.object_name,
     'name',t.tgname,'enabled',t.tgenabled,
     'definition',pg_catalog.pg_get_triggerdef(t.oid)
   ) ORDER BY r.schema_name,r.object_name,t.tgname)
   FROM relations r
   JOIN pg_catalog.pg_trigger t ON t.tgrelid=r.oid
   WHERE NOT t.tgisinternal
 ),'[]'::jsonb)
)) AS metadata_json;

-- Consultas COMPLEMENTARIAS OPCIONALES (solo si la tabla existe):
-- SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;
-- SELECT jobname,schedule,active FROM cron.job ORDER BY jobname;
-- No consultar vault.decrypted_secrets, auth.users ni filas de pedidos/clientes.
