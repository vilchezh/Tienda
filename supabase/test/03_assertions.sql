-- Ejecutar con psql -v ON_ERROR_STOP=1. Transacción de test, siempre rollback.
begin;
do $$ begin
  if not (select relrowsecurity from pg_class where oid = 'public.checkout_rate_windows'::regclass) then
    raise exception 'checkout_rate_windows sin RLS'; end if;
  if has_table_privilege('anon', 'public.checkout_rate_windows', 'select') or
     has_table_privilege('authenticated', 'public.checkout_rate_windows', 'insert') or
     has_function_privilege('anon', 'public.checkout_take_rate_slot()', 'execute') or
     has_function_privilege('authenticated', 'public.checkout_finalize_creation(uuid,text,text)', 'execute') or
     has_function_privilege('anon', 'public.checkout_record_verified_order(uuid,text,text,text,text,text,text,numeric)', 'execute') then
    raise exception 'privilegios internos expuestos'; end if;
  if not has_function_privilege('service_role', 'public.checkout_take_rate_slot()', 'execute') then
    raise exception 'service_role sin acceso interno'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.checkout_order_customers'::regclass) or
     not (select relrowsecurity from pg_class where oid = 'public.checkout_order_events'::regclass) or
     not (select relrowsecurity from pg_class where oid = 'public.checkout_email_outbox'::regclass) then
    raise exception 'tablas privadas sin RLS'; end if;
  if has_table_privilege('anon', 'public.checkout_order_customers', 'select') or
     has_table_privilege('authenticated', 'public.checkout_order_customers', 'insert,update,delete') or
     has_function_privilege('authenticated', 'public.checkout_create_order(uuid,text,jsonb,jsonb,bigint,numeric,bigint,jsonb)', 'execute') or
     has_function_privilege('anon', 'public.checkout_claim_notifications(uuid)', 'execute') or
     has_function_privilege('authenticated', 'public.checkout_due_notification_orders(integer)', 'execute') then
    raise exception 'datos personales u outbox expuestos'; end if;
  if not has_column_privilege('authenticated', 'public.checkout_orders', 'manufacturing_status', 'update') or
     has_column_privilege('authenticated', 'public.checkout_orders', 'payment_status', 'update') then
    raise exception 'permisos de actualización de pedidos incorrectos'; end if;
end $$;

set local role anon;
do $$ begin
  if (select count(*) from public.productos) <> 1 then raise exception 'catálogo ficticio no visible'; end if;
end $$;
reset role;

set local role authenticated;
do $$ begin
  if (select count(*) from public.checkout_orders) <> 0 then raise exception 'pedido visible sin admin'; end if;
  if (select count(*) from public.checkout_order_customers) <> 0 then raise exception 'compradores visibles sin admin'; end if;
  if (select tienda_security.is_admin()) then raise exception 'usuario anónimo es admin'; end if;
end $$;
reset role;

set local role service_role;
do $$ begin
  if not public.checkout_take_rate_slot() then raise exception 'service_role sin cupo interno'; end if;
end $$;
reset role;

select public.checkout_create_order(
  '22222222-2222-4222-8222-222222222222',
  'pieza-sandbox-001',
  '{"id":"pieza-sandbox-001","nombre":"Pieza ficticia","sku":"SBX-001"}'::jsonb,
  '{"wood_type":"Madera de prueba","extras":[]}'::jsonb,
  100000, 0, 100000,
  '{"full_name":"Cliente de Prueba","email":"buyer@example.invalid","phone":null,"delivery_method":"pickup","privacy_accepted":true}'::jsonb
);
select public.checkout_finalize_creation(id, 'sandbox-order-1', 'https://www.mercadopago.com.ar/checkout/test')
from public.checkout_orders where client_request_id = '22222222-2222-4222-8222-222222222222';
do $$ declare local_order_id uuid; first_call boolean; second_call boolean; begin
  select id into local_order_id from public.checkout_orders where client_request_id = '22222222-2222-4222-8222-222222222222';
  first_call := public.checkout_record_verified_order(local_order_id, 'sandbox-order-1', 'event-1', 'order.updated', 'processed', 'processed', null, 100000);
  second_call := public.checkout_record_verified_order(local_order_id, 'sandbox-order-1', 'event-1', 'order.updated', 'processed', 'processed', null, 100000);
  if not first_call or second_call then raise exception 'deduplicación rota'; end if;
  if (select count(*) from public.checkout_email_outbox where order_id = local_order_id) <> 2 then
    raise exception 'outbox no creó exactamente dos avisos'; end if;
  perform public.checkout_finalize_creation(local_order_id, 'sandbox-order-1', 'https://www.mercadopago.com.ar/checkout/test');
  if (select payment_status from public.checkout_orders where id = local_order_id) <> 'processed' then
    raise exception 'creación pisó el webhook'; end if;
  perform public.checkout_record_verified_order(local_order_id, 'sandbox-order-1', 'event-2', 'order.updated', 'refunded', 'refunded', null, 0);
  perform public.checkout_record_verified_order(local_order_id, 'sandbox-order-1', 'event-3', 'order.updated', 'processed', 'processed', null, 100000);
  if (select payment_status from public.checkout_orders where id = local_order_id) <> 'refunded' then
    raise exception 'estado adverso retrocedió'; end if;
end $$;
rollback;
