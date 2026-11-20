-- Issue #4: prueba aislada de retención y anonimización.
-- Solo sandbox; no ejecutar si existen contactos vencidos reales.
-- Siempre ROLLBACK: no conserva pedidos, compradores ni correos.
begin;
do $retention$
declare
  old_order uuid;
  new_order uuid;
  purged integer;
  start_orders integer;
  start_customers integer;
  start_outbox integer;
begin
  select count(*) into start_orders from public.checkout_orders;
  select count(*) into start_customers from public.checkout_order_customers;
  select count(*) into start_outbox from public.checkout_email_outbox;
  if exists(select 1 from public.checkout_order_customers where retention_until <= now()) then
    raise exception 'There are genuinely expired contacts: abort sandbox fixture test';
  end if;
  select (public.checkout_create_order(
    '66666666-6666-4666-8666-666666666660',
    'pieza-sandbox-001',
    '{"nombre":"Prueba caducada","sku":"RET-OLD"}'::jsonb,
    '{"wood_type":"Ficticio","extras":[]}'::jsonb,
    100000,0,100000,
    '{"full_name":"Contacto Caducado","email":"expired@example.invalid","delivery_method":"pickup","privacy_accepted":true}'::jsonb
  )->>'id')::uuid into old_order;
  select (public.checkout_create_order(
    '66666666-6666-4666-8666-666666666661',
    'pieza-sandbox-001',
    '{"nombre":"Prueba vigente","sku":"RET-NEW"}'::jsonb,
    '{"wood_type":"Ficticio","extras":[]}'::jsonb,
    100000,0,100000,
    '{"full_name":"Contacto Vigente","email":"active@example.invalid","delivery_method":"pickup","privacy_accepted":true}'::jsonb
  )->>'id')::uuid into new_order;
  perform public.checkout_finalize_creation(old_order,'ret-test-mp-old','https://www.mercadopago.com.ar/checkout/test');
  perform public.checkout_finalize_creation(new_order,'ret-test-mp-new','https://www.mercadopago.com.ar/checkout/test');
  if not public.checkout_record_verified_order(old_order,'ret-test-mp-old','ret-event-old','order.updated','processed','processed',null,100000)
     or not public.checkout_record_verified_order(new_order,'ret-test-mp-new','ret-event-new','order.updated','processed','processed',null,100000)
  then raise exception 'Could not create isolated fake outbox'; end if;
  if (select count(*) from public.checkout_email_outbox where order_id=old_order and recipient_email='expired@example.invalid')<>1
    or (select count(*) from public.checkout_email_outbox where order_id=new_order and recipient_email='active@example.invalid')<>1
  then raise exception 'Original fictitious email recipients missing'; end if;
  update public.checkout_order_customers
     set retention_until=now()-interval '1 day' where order_id=old_order;
  purged:=public.checkout_purge_expired_customer_data();
  if purged<>1 then raise exception 'Expected one expired contact, got %', purged;end if;
  if exists (select 1 from public.checkout_order_customers where order_id=old_order)
     or not exists (select 1 from public.checkout_order_customers where order_id=new_order)
  then raise exception 'Contact retention failed';end if;
  if exists (select 1 from public.checkout_email_outbox where order_id=old_order and recipient_email is not null)
     or (select count(*) from public.checkout_email_outbox where order_id=new_order and recipient_email='active@example.invalid')<>1
  then raise exception 'Email anonymization or active recipient failed';end if;
  if (select count(*) from public.checkout_orders where id in (old_order,new_order))<>2 then
    raise exception 'Checkout orders should be retained';end if;
  if (select count(*) from public.checkout_orders)<>start_orders+2
     or (select count(*) from public.checkout_order_customers)<>start_customers+1
     or (select count(*) from public.checkout_email_outbox)<>start_outbox+4
  then raise exception 'Unexpected table counts during transaction';end if;
  if public.checkout_purge_expired_customer_data()<>0 then raise exception 'Purge must be idempotent';end if;
end $retention$;
rollback;
