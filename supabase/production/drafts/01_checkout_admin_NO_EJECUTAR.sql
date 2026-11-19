-- BORRADOR PRODUCCION / NO AUTORIZADO PARA EJECUTAR
-- Sólo entorno original ivyagavbhsyzvikzhmhe después de backup, ensayo y autorización.
-- Conserva productos, archivos del catálogo, administrador y stock_taller.
-- No instala cron, secretos, MFA, Turnstile ni activa cobros.
BEGIN;

DO $preflight$
DECLARE obj text;
BEGIN
 IF to_regclass('public.productos') IS NULL
    OR to_regclass('tienda_security.admins') IS NULL
    OR to_regprocedure('tienda_security.is_admin()') IS NULL THEN
  RAISE EXCEPTION 'ABORT: falta el catálogo o la autorización de administradores';
 END IF;
 IF NOT (SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid='public.productos'::regclass) THEN
  RAISE EXCEPTION 'ABORT: catálogo sin RLS';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM tienda_security.admins) THEN
  RAISE EXCEPTION 'ABORT: no hay administrador configurado';
 END IF;
 IF EXISTS (SELECT 1 FROM public.productos
  WHERE precio_base IS NULL OR precio_base<0
    OR precio_base<>trunc(precio_base)
    OR precio_base>9007199254740991) THEN
  RAISE EXCEPTION 'ABORT: precios incompatibles con checkout; revisar sin modificar';
 END IF;

 IF EXISTS(SELECT 1 FROM pg_catalog.pg_attribute
   WHERE attrelid='public.productos'::regclass
   AND attname='checkout_habilitado' AND NOT attisdropped) THEN
  RAISE EXCEPTION 'ABORT: checkout ya parcialmente instalado';
 END IF;
 FOREACH obj IN ARRAY ARRAY['public.checkout_settings','public.checkout_orders','public.mp_webhook_events','public.checkout_rate_windows','public.checkout_order_customers','public.checkout_order_events','public.checkout_email_outbox','public.storefront_content'] LOOP
  IF to_regclass(obj) IS NOT NULL THEN
   RAISE EXCEPTION 'ABORT: objeto existente (%); requiere conciliación manual',obj;
  END IF;
 END LOOP;
END;
$preflight$;

-- SOURCE: supabase/migrations/20261114040000_checkout_pro_orders.sql
-- Las funciones usan exclusivamente MP_ACCESS_TOKEN_TEST y nunca buscan un token productivo.

alter table public.productos
  add column if not exists checkout_habilitado boolean not null default false;

create table if not exists public.checkout_settings (
  id text primary key default 'default' check (id = 'default'),
  commission_percent numeric(5, 2) not null default 0
    check (commission_percent >= 0 and commission_percent <= 50),
  payments_enabled boolean not null default false,
  updated_at timestamptz not null default timezone('utc', now())
);

insert into public.checkout_settings (id, commission_percent, payments_enabled)
values ('default', 0, false)
on conflict (id) do nothing;

alter table public.checkout_settings enable row level security;

create policy "Configuracion de checkout visible"
on public.checkout_settings for select
to anon, authenticated
using (id = 'default');

create policy "Solo administradores gestionan checkout"
on public.checkout_settings for all
to authenticated
using ((select tienda_security.is_admin()))
with check ((select tienda_security.is_admin()));

create table if not exists public.checkout_orders (
  id uuid primary key default gen_random_uuid(),
  client_request_id uuid not null unique,
  product_id text not null references public.productos(id) on update cascade on delete restrict,
  product_snapshot jsonb not null,
  selection_snapshot jsonb not null,
  subtotal_amount bigint not null check (subtotal_amount > 0),
  commission_percent numeric(5, 2) not null
    check (commission_percent >= 0 and commission_percent <= 50),
  total_amount bigint not null check (total_amount > 0 and total_amount % 1000 = 0),
  currency text not null default 'ARS' check (currency = 'ARS'),
  status text not null default 'creating',
  status_detail text,
  payment_status text,
  mp_order_id text unique,
  mp_checkout_url text,
  mp_paid_amount numeric(14, 2),
  last_webhook_request_id text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists checkout_orders_product_id_idx
  on public.checkout_orders(product_id);

create index if not exists checkout_orders_status_idx
  on public.checkout_orders(status, created_at desc);

alter table public.checkout_orders enable row level security;

create policy "Solo administradores consultan pedidos"
on public.checkout_orders for all
to authenticated
using ((select tienda_security.is_admin()))
with check ((select tienda_security.is_admin()));

create table if not exists public.mp_webhook_events (
  id uuid primary key default gen_random_uuid(),
  request_id text not null unique,
  resource_id text not null,
  event_type text not null,
  action text,
  order_status text,
  payment_status text,
  verified_at timestamptz not null default timezone('utc', now()),
  processed_at timestamptz not null default timezone('utc', now())
);

alter table public.mp_webhook_events enable row level security;

create policy "Solo administradores consultan eventos de pago"
on public.mp_webhook_events for all
to authenticated
using ((select tienda_security.is_admin()))
with check ((select tienda_security.is_admin()));

-- Permisos de Data API explícitos. RLS continúa decidiendo qué filas puede usar cada rol.
grant select on public.checkout_settings to anon;
grant select, update on public.checkout_settings to authenticated;
grant select on public.checkout_orders, public.mp_webhook_events to authenticated;
grant all on public.checkout_settings, public.checkout_orders, public.mp_webhook_events to service_role;

comment on table public.checkout_settings is
  'Configuracion publica no secreta de Checkout Pro de prueba.';
comment on table public.checkout_orders is
  'Pedidos creados del lado servidor. Sin datos de tarjeta ni credenciales.';
comment on table public.mp_webhook_events is
  'Registro minimo para deduplicar notificaciones Order verificadas.';

-- Serializa webhook y creación sobre la misma fila. Solo las Edge Functions con
-- service_role pueden ejecutar estas operaciones; no se exponen a anon/authenticated.
create or replace function public.checkout_finalize_creation(p_id uuid, p_mp_id text, p_url text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.checkout_orders
     set mp_order_id = coalesce(mp_order_id, p_mp_id), mp_checkout_url = p_url,
         status = case when status in ('creating', 'failed') then 'created' else status end,
         updated_at = now()
   where id = p_id and (mp_order_id is null or mp_order_id = p_mp_id);
  if not found then raise exception 'order mismatch'; end if;
end $$;

create or replace function public.checkout_record_verified_order(
  p_id uuid, p_mp_id text, p_request_id text, p_action text,
  p_status text, p_payment_status text, p_detail text, p_paid numeric
) returns boolean language plpgsql security definer set search_path = public as $$
declare current_row public.checkout_orders%rowtype;
begin
  select * into current_row from public.checkout_orders where id = p_id for update;
  if not found or (current_row.mp_order_id is not null and current_row.mp_order_id <> p_mp_id)
    then raise exception 'order mismatch'; end if;
  insert into public.mp_webhook_events(request_id, resource_id, event_type, action, order_status, payment_status)
  values (p_request_id, p_mp_id, 'order', p_action, p_status, p_payment_status)
  on conflict (request_id) do nothing;
  if not found then return false; end if;
  -- Estados adversos son absorbentes frente a respuestas anteriores y eventos fuera de orden.
  if current_row.payment_status = 'charged_back' and p_payment_status <> 'charged_back'
    then return true; end if;
  if current_row.payment_status in ('refunded', 'partially_refunded', 'manual_review', 'canceled', 'failed')
     and p_payment_status not in ('refunded', 'partially_refunded', 'charged_back', 'manual_review')
    then return true; end if;
  if current_row.payment_status = 'processed' and p_payment_status in ('created', 'processing', 'action_required')
    then return true; end if;
  update public.checkout_orders set mp_order_id = p_mp_id, status = p_status,
    payment_status = p_payment_status, status_detail = p_detail, mp_paid_amount = p_paid,
    last_webhook_request_id = p_request_id, updated_at = now() where id = p_id;
  return true;
end $$;

revoke all on function public.checkout_finalize_creation(uuid,text,text) from public, anon, authenticated;
revoke all on function public.checkout_record_verified_order(uuid,text,text,text,text,text,text,numeric) from public, anon, authenticated;
grant execute on function public.checkout_finalize_creation(uuid,text,text) to service_role;
grant execute on function public.checkout_record_verified_order(uuid,text,text,text,text,text,text,numeric) to service_role;

create table public.checkout_rate_windows (
  window_start timestamptz primary key,
  requests integer not null check (requests > 0)
);
alter table public.checkout_rate_windows enable row level security;
revoke all on public.checkout_rate_windows from public, anon, authenticated;
grant all on public.checkout_rate_windows to service_role;
create or replace function public.checkout_take_rate_slot() returns boolean
language plpgsql security definer set search_path = public as $$
declare count_now integer;
begin
  insert into public.checkout_rate_windows(window_start, requests)
  values (date_trunc('minute', now()), 1)
  on conflict (window_start) do update set requests = checkout_rate_windows.requests + 1
  returning requests into count_now;
  delete from public.checkout_rate_windows where window_start < now() - interval '1 day';
  return count_now <= 60;
end $$;
revoke all on function public.checkout_take_rate_slot() from public, anon, authenticated;
grant execute on function public.checkout_take_rate_slot() to service_role;

-- SOURCE: supabase/migrations/20261114204035_order_management.sql
-- Este archivo se versiona, pero no se aplica automáticamente.

alter table public.checkout_settings
  add column if not exists personal_data_retention_days integer not null default 365
    check (personal_data_retention_days between 30 and 3650);

alter table public.checkout_orders
  add column if not exists manufacturing_status text not null default 'not_started'
    check (manufacturing_status in ('not_started', 'confirmed', 'in_production', 'ready', 'delivered', 'canceled')),
  add column if not exists internal_notes text not null default ''
    check (char_length(internal_notes) <= 4000),
  add column if not exists manufacturing_updated_at timestamptz;

create index if not exists checkout_orders_manufacturing_idx
  on public.checkout_orders(manufacturing_status, created_at desc);
create index if not exists checkout_orders_created_at_idx
  on public.checkout_orders(created_at desc);

-- Los datos personales viven separados del pedido y nunca se conceden a anon.
create table if not exists public.checkout_order_customers (
  order_id uuid primary key references public.checkout_orders(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 120),
  email text not null check (char_length(email) between 3 and 254),
  phone text check (phone is null or char_length(phone) between 7 and 30),
  delivery_method text not null check (delivery_method in ('pickup', 'delivery')),
  address_line text check (address_line is null or char_length(address_line) <= 180),
  city text check (city is null or char_length(city) <= 100),
  province text check (province is null or char_length(province) <= 100),
  postal_code text check (postal_code is null or char_length(postal_code) <= 20),
  delivery_notes text check (delivery_notes is null or char_length(delivery_notes) <= 500),
  privacy_accepted_at timestamptz not null,
  retention_until timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint checkout_customer_delivery_fields check (
    delivery_method = 'pickup' or
    (nullif(address_line, '') is not null and nullif(city, '') is not null and
     nullif(province, '') is not null and nullif(postal_code, '') is not null)
  )
);

alter table public.checkout_order_customers enable row level security;
create index if not exists checkout_order_customers_retention_idx
  on public.checkout_order_customers(retention_until);
revoke all on table public.checkout_order_customers from public, anon, authenticated;
grant select on table public.checkout_order_customers to authenticated;
grant all on table public.checkout_order_customers to service_role;

create policy "Administradores consultan compradores"
on public.checkout_order_customers for select
to authenticated
using ((select tienda_security.is_admin()));

-- Historial inmutable de cambios hechos desde el panel.
create table if not exists public.checkout_order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.checkout_orders(id) on delete cascade,
  actor_id uuid,
  event_type text not null check (event_type in ('manufacturing_status_changed', 'internal_notes_changed', 'order_management_changed')),
  previous_values jsonb not null default '{}'::jsonb,
  new_values jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists checkout_order_events_order_idx
  on public.checkout_order_events(order_id, created_at desc);

alter table public.checkout_order_events enable row level security;
revoke all on table public.checkout_order_events from public, anon, authenticated;
grant select on table public.checkout_order_events to authenticated;
grant all on table public.checkout_order_events to service_role;

create policy "Administradores consultan auditoria de pedidos"
on public.checkout_order_events for select
to authenticated
using ((select tienda_security.is_admin()));

create or replace function tienda_security.audit_checkout_order_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  change_type text;
begin
  if old.manufacturing_status is not distinct from new.manufacturing_status
     and old.internal_notes is not distinct from new.internal_notes then
    return new;
  end if;

  if old.manufacturing_status is distinct from new.manufacturing_status
     and old.internal_notes is distinct from new.internal_notes then
    change_type := 'order_management_changed';
  elsif old.manufacturing_status is distinct from new.manufacturing_status then
    change_type := 'manufacturing_status_changed';
  else
    change_type := 'internal_notes_changed';
  end if;

  if old.manufacturing_status is distinct from new.manufacturing_status then
    new.manufacturing_updated_at := timezone('utc', now());
  end if;
  new.updated_at := timezone('utc', now());

  insert into public.checkout_order_events(
    order_id, actor_id, event_type, previous_values, new_values
  ) values (
    new.id,
    (select auth.uid()),
    change_type,
    jsonb_build_object('manufacturing_status', old.manufacturing_status, 'internal_notes', old.internal_notes),
    jsonb_build_object('manufacturing_status', new.manufacturing_status, 'internal_notes', new.internal_notes)
  );
  return new;
end;
$$;

revoke all on function tienda_security.audit_checkout_order_update() from public, anon, authenticated;

drop trigger if exists audit_checkout_order_management on public.checkout_orders;
create trigger audit_checkout_order_management
before update of manufacturing_status, internal_notes on public.checkout_orders
for each row execute function tienda_security.audit_checkout_order_update();

-- La UI autenticada sólo puede modificar estas dos columnas. Los estados de pago
-- continúan reservados a la Edge Function con service_role.
grant update (manufacturing_status, internal_notes) on public.checkout_orders to authenticated;

-- Outbox de correo. La combinación pedido/tipo es la clave de idempotencia local.
create table if not exists public.checkout_email_outbox (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.checkout_orders(id) on delete cascade,
  notification_type text not null check (notification_type in ('customer_payment_confirmed', 'seller_payment_received')),
  recipient_email text,
  status text not null default 'pending',
  attempt_count integer not null default 0 check (attempt_count >= 0),
  first_attempt_at timestamptz,
  idempotency_expires_at timestamptz,
  next_attempt_at timestamptz not null default timezone('utc', now()),
  locked_at timestamptz,
  provider_message_id text,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (order_id, notification_type)
);

-- Permite aplicar esta revisión de forma segura si la versión inicial de esta
alter table public.checkout_email_outbox
  add column if not exists first_attempt_at timestamptz,
  add column if not exists idempotency_expires_at timestamptz;
alter table public.checkout_email_outbox
  drop constraint if exists checkout_email_outbox_status_check;
alter table public.checkout_email_outbox
  add constraint checkout_email_outbox_status_check
  check (status in ('pending', 'processing', 'sent', 'failed', 'uncertain'));

create index if not exists checkout_email_outbox_pending_idx
  on public.checkout_email_outbox(status, next_attempt_at)
  where status in ('pending', 'failed', 'processing');
create index if not exists checkout_email_outbox_stale_processing_idx
  on public.checkout_email_outbox(locked_at)
  where status = 'processing';

alter table public.checkout_email_outbox enable row level security;
revoke all on table public.checkout_email_outbox from public, anon, authenticated;
grant select on table public.checkout_email_outbox to authenticated;
grant all on table public.checkout_email_outbox to service_role;

create policy "Administradores consultan entregas de correo"
on public.checkout_email_outbox for select
to authenticated
using ((select tienda_security.is_admin()));

-- Inserta pedido y contacto en una sola transacción. Sólo la función de creación
-- de órdenes puede invocarla; el navegador nunca recibe permisos de escritura.
create or replace function public.checkout_create_order(
  p_client_request_id uuid,
  p_product_id text,
  p_product_snapshot jsonb,
  p_selection_snapshot jsonb,
  p_subtotal_amount bigint,
  p_commission_percent numeric,
  p_total_amount bigint,
  p_contact jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  created_order public.checkout_orders%rowtype;
  method text := trim(coalesce(p_contact->>'delivery_method', ''));
  retention_days integer;
begin
  if jsonb_typeof(p_contact) <> 'object'
     or char_length(trim(coalesce(p_contact->>'full_name', ''))) not between 2 and 120
     or char_length(trim(coalesce(p_contact->>'email', ''))) not between 3 and 254
     or lower(trim(p_contact->>'email')) !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
     or coalesce((p_contact->>'privacy_accepted')::boolean, false) is not true
     or method not in ('pickup', 'delivery') then
    raise exception 'invalid customer data' using errcode = '22023';
  end if;
  if method = 'delivery' and (
    nullif(trim(coalesce(p_contact->>'address_line', '')), '') is null or
    nullif(trim(coalesce(p_contact->>'city', '')), '') is null or
    nullif(trim(coalesce(p_contact->>'province', '')), '') is null or
    nullif(trim(coalesce(p_contact->>'postal_code', '')), '') is null
  ) then
    raise exception 'delivery address required' using errcode = '22023';
  end if;

  select personal_data_retention_days into retention_days
  from public.checkout_settings where id = 'default';

  insert into public.checkout_orders(
    client_request_id, product_id, product_snapshot, selection_snapshot,
    subtotal_amount, commission_percent, total_amount, currency, status
  ) values (
    p_client_request_id, p_product_id, p_product_snapshot, p_selection_snapshot,
    p_subtotal_amount, p_commission_percent, p_total_amount, 'ARS', 'creating'
  ) returning * into created_order;

  insert into public.checkout_order_customers(
    order_id, full_name, email, phone, delivery_method, address_line, city,
    province, postal_code, delivery_notes, privacy_accepted_at, retention_until
  ) values (
    created_order.id,
    trim(p_contact->>'full_name'),
    lower(trim(p_contact->>'email')),
    nullif(trim(coalesce(p_contact->>'phone', '')), ''),
    method,
    case when method = 'delivery' then nullif(trim(coalesce(p_contact->>'address_line', '')), '') end,
    case when method = 'delivery' then nullif(trim(coalesce(p_contact->>'city', '')), '') end,
    case when method = 'delivery' then nullif(trim(coalesce(p_contact->>'province', '')), '') end,
    case when method = 'delivery' then nullif(trim(coalesce(p_contact->>'postal_code', '')), '') end,
    nullif(trim(coalesce(p_contact->>'delivery_notes', '')), ''),
    timezone('utc', now()),
    timezone('utc', now()) + make_interval(days => coalesce(retention_days, 365))
  );

  return to_jsonb(created_order);
end;
$$;

revoke all on function public.checkout_create_order(uuid,text,jsonb,jsonb,bigint,numeric,bigint,jsonb)
  from public, anon, authenticated;
grant execute on function public.checkout_create_order(uuid,text,jsonb,jsonb,bigint,numeric,bigint,jsonb)
  to service_role;

-- Reclamo transaccional para evitar que webhooks simultáneos envíen dos veces.
create or replace function public.checkout_claim_notifications(p_order_id uuid default null)
returns setof public.checkout_email_outbox
language sql
security definer
set search_path = public, pg_temp
as $$
  with due as (
    select id
    from public.checkout_email_outbox
    where (p_order_id is null or order_id = p_order_id)
      and attempt_count < 8
      and (idempotency_expires_at is null or idempotency_expires_at > timezone('utc', now()))
      and (
        (status in ('pending', 'failed') and next_attempt_at <= timezone('utc', now())) or
        (status = 'processing' and locked_at < timezone('utc', now()) - interval '10 minutes')
      )
    order by created_at
    for update skip locked
  )
  update public.checkout_email_outbox o
     set status = 'processing', attempt_count = o.attempt_count + 1,
         first_attempt_at = coalesce(o.first_attempt_at, timezone('utc', now())),
         idempotency_expires_at = coalesce(
           o.idempotency_expires_at,
           timezone('utc', now()) + interval '23 hours'
         ),
         locked_at = timezone('utc', now()), updated_at = timezone('utc', now())
    from due
   where o.id = due.id
  returning o.*;
$$;

revoke all on function public.checkout_claim_notifications(uuid) from public, anon, authenticated;
grant execute on function public.checkout_claim_notifications(uuid) to service_role;

create or replace function public.checkout_due_notification_orders(p_limit integer default 25)
returns table(order_id uuid)
language sql
security definer
set search_path = public, pg_temp
as $$
  select o.order_id
  from public.checkout_email_outbox o
  where o.attempt_count < 8
    and (o.idempotency_expires_at is null or o.idempotency_expires_at > timezone('utc', now()))
    and (
      (o.status in ('pending', 'failed') and o.next_attempt_at <= timezone('utc', now())) or
      (o.status = 'processing' and o.locked_at < timezone('utc', now()) - interval '10 minutes')
    )
  group by o.order_id
  order by min(o.created_at)
  limit least(greatest(coalesce(p_limit, 25), 1), 100);
$$;

revoke all on function public.checkout_due_notification_orders(integer) from public, anon, authenticated;
grant execute on function public.checkout_due_notification_orders(integer) to service_role;

-- Resend conserva claves de idempotencia durante 24 horas. La ventana local se
-- cierra una hora antes: después de ese límite el resultado requiere revisión
-- manual y nunca se vuelve a enviar automáticamente con una clave vencida.
create or replace function public.checkout_expire_uncertain_notifications()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  expired integer;
begin
  update public.checkout_email_outbox
     set status = 'uncertain',
         locked_at = null,
         last_error = coalesce(last_error, 'idempotency_window_expired'),
         updated_at = timezone('utc', now())
   where status in ('pending', 'failed', 'processing')
     and idempotency_expires_at <= timezone('utc', now());
  get diagnostics expired = row_count;
  return expired;
end;
$$;

revoke all on function public.checkout_expire_uncertain_notifications() from public, anon, authenticated;
grant execute on function public.checkout_expire_uncertain_notifications() to service_role;

-- Extiende el registro atómico existente sin cambiar su firma ni su protección.
create or replace function public.checkout_record_verified_order(
  p_id uuid, p_mp_id text, p_request_id text, p_action text,
  p_status text, p_payment_status text, p_detail text, p_paid numeric
) returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  current_row public.checkout_orders%rowtype;
  was_accredited boolean;
begin
  select * into current_row from public.checkout_orders where id = p_id for update;
  if not found or (current_row.mp_order_id is not null and current_row.mp_order_id <> p_mp_id)
    then raise exception 'order mismatch'; end if;
  insert into public.mp_webhook_events(request_id, resource_id, event_type, action, order_status, payment_status)
  values (p_request_id, p_mp_id, 'order', p_action, p_status, p_payment_status)
  on conflict (request_id) do nothing;
  if not found then return false; end if;

  if current_row.payment_status = 'charged_back' and p_payment_status <> 'charged_back'
    then return true; end if;
  if current_row.payment_status = 'refunded'
     and p_payment_status not in ('refunded', 'charged_back')
    then return true; end if;
  if current_row.payment_status = 'partially_refunded'
     and p_payment_status not in ('partially_refunded', 'refunded', 'charged_back')
    then return true; end if;
  if current_row.payment_status in ('manual_review', 'canceled', 'failed')
     and p_payment_status not in ('refunded', 'partially_refunded', 'charged_back', 'manual_review')
    then return true; end if;
  if current_row.payment_status = 'processed' and p_payment_status in ('created', 'processing', 'action_required')
    then return true; end if;

  was_accredited := coalesce(current_row.payment_status = 'processed', false);
  update public.checkout_orders set mp_order_id = p_mp_id, status = p_status,
    payment_status = p_payment_status, status_detail = p_detail, mp_paid_amount = p_paid,
    last_webhook_request_id = p_request_id, updated_at = timezone('utc', now()) where id = p_id;

  if p_payment_status = 'processed' and not was_accredited then
    insert into public.checkout_email_outbox(order_id, notification_type, recipient_email)
    select p_id, 'customer_payment_confirmed', c.email
    from public.checkout_order_customers c where c.order_id = p_id
    on conflict (order_id, notification_type) do nothing;

    insert into public.checkout_email_outbox(order_id, notification_type)
    values (p_id, 'seller_payment_received')
    on conflict (order_id, notification_type) do nothing;
  end if;
  return true;
end $$;

revoke all on function public.checkout_record_verified_order(uuid,text,text,text,text,text,text,numeric)
  from public, anon, authenticated;
grant execute on function public.checkout_record_verified_order(uuid,text,text,text,text,text,text,numeric)
  to service_role;

-- Operación de retención preparada para una tarea programada futura. No se agenda
-- desde esta migración. Elimina contacto vencido y anonimiza destinatarios del log.
create or replace function public.checkout_purge_expired_customer_data()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  purged integer;
begin
  update public.checkout_email_outbox o
     set recipient_email = null, updated_at = timezone('utc', now())
    from public.checkout_order_customers c
   where c.order_id = o.order_id and c.retention_until <= timezone('utc', now());

  delete from public.checkout_order_customers
   where retention_until <= timezone('utc', now());
  get diagnostics purged = row_count;
  return purged;
end;
$$;

revoke all on function public.checkout_purge_expired_customer_data() from public, anon, authenticated;
grant execute on function public.checkout_purge_expired_customer_data() to service_role;

comment on table public.checkout_order_customers is
  'Contacto y entrega privados. Acceso de lectura sólo para administradores autorizados.';
comment on table public.checkout_order_events is
  'Auditoría inmutable de estados de fabricación y notas internas.';
comment on table public.checkout_email_outbox is
  'Outbox idempotente y registro de intentos de correo transaccional.';

-- SOURCE: supabase/migrations/20261115174702_improve_order_attempts_admin.sql
-- Paginación/filtrado administrativo e identificación de rechazos permanentes.

alter table public.checkout_email_outbox
  drop constraint if exists checkout_email_outbox_status_check;
alter table public.checkout_email_outbox
  add constraint checkout_email_outbox_status_check
  check (status in ('pending', 'processing', 'sent', 'failed', 'rejected', 'uncertain'));

create index if not exists checkout_orders_payment_created_idx
  on public.checkout_orders(payment_status, created_at desc);

create or replace function public.checkout_admin_list_orders(
  p_search text default null,
  p_payment_group text default 'all',
  p_payment_status text default null,
  p_manufacturing_status text default null,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null,
  p_sort text default 'desc',
  p_limit integer default 50,
  p_offset integer default 0
)
returns table(order_data jsonb, total_count bigint)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with filtered as (
    select
      o.*,
      c.order_id as customer_order_id,
      c.full_name as customer_full_name,
      c.email as customer_email,
      c.phone as customer_phone,
      c.delivery_method as customer_delivery_method,
      c.address_line as customer_address_line,
      c.city as customer_city,
      c.province as customer_province,
      c.postal_code as customer_postal_code,
      c.delivery_notes as customer_delivery_notes,
      c.retention_until as customer_retention_until
    from public.checkout_orders o
    left join public.checkout_order_customers c on c.order_id = o.id
    where (select tienda_security.is_admin())
      and (
        nullif(trim(p_search), '') is null or
        o.id::text ilike '%' || left(trim(p_search), 120) || '%' or
        coalesce(o.mp_order_id, '') ilike '%' || left(trim(p_search), 120) || '%' or
        o.product_id ilike '%' || left(trim(p_search), 120) || '%' or
        coalesce(o.product_snapshot->>'nombre', '') ilike '%' || left(trim(p_search), 120) || '%' or
        coalesce(o.product_snapshot->>'sku', '') ilike '%' || left(trim(p_search), 120) || '%' or
        coalesce(c.full_name, '') ilike '%' || left(trim(p_search), 120) || '%' or
        coalesce(c.email, '') ilike '%' || left(trim(p_search), 120) || '%'
      )
      and (
        coalesce(p_payment_group, 'all') = 'all' or
        (p_payment_group = 'accredited' and coalesce(o.payment_status, o.status, 'created') = 'processed') or
        (p_payment_group = 'unpaid' and coalesce(o.payment_status, o.status, 'created') in ('created', 'failed', 'canceled')) or
        (p_payment_group = 'processing' and coalesce(o.payment_status, o.status, 'created') in ('processing', 'action_required', 'manual_review')) or
        (p_payment_group = 'refunded' and coalesce(o.payment_status, o.status, 'created') in ('refunded', 'partially_refunded', 'charged_back'))
      )
      and (p_payment_status is null or coalesce(o.payment_status, o.status, 'created') = p_payment_status)
      and (p_manufacturing_status is null or o.manufacturing_status = p_manufacturing_status)
      and (p_date_from is null or o.created_at >= p_date_from)
      and (p_date_to is null or o.created_at < p_date_to)
  ), counted as (
    select filtered.*, count(*) over () as filtered_count
    from filtered
  )
  select
    jsonb_build_object(
      'id', result.id,
      'product_id', result.product_id,
      'product_snapshot', result.product_snapshot,
      'selection_snapshot', result.selection_snapshot,
      'total_amount', result.total_amount,
      'currency', result.currency,
      'status', result.status,
      'payment_status', result.payment_status,
      'status_detail', result.status_detail,
      'mp_order_id', result.mp_order_id,
      'created_at', result.created_at,
      'updated_at', result.updated_at,
      'manufacturing_status', result.manufacturing_status,
      'manufacturing_updated_at', result.manufacturing_updated_at,
      'internal_notes', result.internal_notes,
      'checkout_order_customers', case when result.customer_order_id is null then null else jsonb_build_object(
        'full_name', result.customer_full_name,
        'email', result.customer_email,
        'phone', result.customer_phone,
        'delivery_method', result.customer_delivery_method,
        'address_line', result.customer_address_line,
        'city', result.customer_city,
        'province', result.customer_province,
        'postal_code', result.customer_postal_code,
        'delivery_notes', result.customer_delivery_notes,
        'retention_until', result.customer_retention_until
      ) end,
      'checkout_email_outbox', coalesce((
        select jsonb_agg(jsonb_build_object(
          'notification_type', email.notification_type,
          'status', email.status,
          'attempt_count', email.attempt_count,
          'sent_at', email.sent_at,
          'last_error', email.last_error
        ) order by email.created_at)
        from public.checkout_email_outbox email
        where email.order_id = result.id
      ), '[]'::jsonb)
    ) as order_data,
    result.filtered_count as total_count
  from counted result
  order by
    case when p_sort = 'asc' then result.created_at end asc,
    case when p_sort <> 'asc' or p_sort is null then result.created_at end desc,
    result.id
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.checkout_admin_list_orders(text,text,text,text,timestamptz,timestamptz,text,integer,integer)
  from public, anon;
grant execute on function public.checkout_admin_list_orders(text,text,text,text,timestamptz,timestamptz,text,integer,integer)
  to authenticated;

comment on function public.checkout_admin_list_orders(text,text,text,text,timestamptz,timestamptz,text,integer,integer) is
  'Lista paginada de pedidos. Se ejecuta con RLS del usuario y exige autorización administrativa.';

-- SOURCE: supabase/migrations/20261117210000_harden_checkout_privileges.sql
-- No toca datos, estados, políticas RLS, SELECT, INSERT ni los permisos UPDATE vigentes.

revoke truncate, trigger, references, maintain
  on table public.checkout_orders, public.checkout_settings
  from public, anon, authenticated;

do $$
declare
  target text;
  role_name text;
  privilege text;
begin
  foreach target in array array['public.checkout_orders','public.checkout_settings'] loop
    foreach role_name in array array['anon','authenticated'] loop
      foreach privilege in array array['TRUNCATE','TRIGGER','REFERENCES','MAINTAIN'] loop
        if has_table_privilege(role_name, target, privilege) then
          raise exception 'Unexpected checkout permission: % on % for %',
            privilege, target, role_name;
        end if;
      end loop;
    end loop;
  end loop;
  if not has_table_privilege('anon','public.checkout_settings','SELECT')
     or not has_table_privilege('authenticated','public.checkout_settings','SELECT')
     or not has_table_privilege('authenticated','public.checkout_orders','SELECT')
     or not has_column_privilege('authenticated','public.checkout_orders','manufacturing_status','UPDATE')
     or not has_column_privilege('authenticated','public.checkout_orders','internal_notes','UPDATE') then
    raise exception 'Required checkout read / admin edit privileges changed unexpectedly';
  end if;
end $$;

-- SOURCE: supabase/migrations/20261117235800_storefront_home_editor.sql
-- Not automatically applied; requires reviewed migration before enabling editor.

create table public.storefront_content (
 id text primary key check(id='home'),
 hero_eyebrow text not null default 'ACERO FIRME. MADERA VIVA.' check(char_length(hero_eyebrow) between 1 and 80),
 hero_title text not null default 'Diseño que deja huella.' check(char_length(hero_title) between 1 and 100),
 hero_description text not null default 'Piezas de carácter industrial para darle identidad a tu espacio. Elegí los materiales, explorá cada detalle y hacela tuya.' check(char_length(hero_description) between 1 and 420),
 hero_image text not null default 'assets/img/email-pangolin-708c76-sharp.png' check(char_length(hero_image) between 1 and 500 and (hero_image like 'assets/img/%' or hero_image like 'https://%')),
 section_order text[] not null default array['hero','featured','catalog','custom']::text[] check(array_length(section_order,1)=4 and section_order @> array['hero','featured','catalog','custom']::text[] and section_order <@ array['hero','featured','catalog','custom']::text[]),
 sections_visible jsonb not null default '{"hero":true,"featured":true,"catalog":true,"custom":true}'::jsonb check(jsonb_typeof(sections_visible)='object' and jsonb_typeof(sections_visible->'hero')='boolean' and jsonb_typeof(sections_visible->'featured')='boolean' and jsonb_typeof(sections_visible->'catalog')='boolean' and jsonb_typeof(sections_visible->'custom')='boolean'),
 featured_product_ids text[] not null default array[]::text[] check(cardinality(featured_product_ids)<=12),
 updated_at timestamptz not null default now()
);
insert into public.storefront_content(id) values('home');
alter table public.storefront_content enable row level security;
revoke all on public.storefront_content from public,anon,authenticated;
grant select on public.storefront_content to anon,authenticated;
grant update(hero_eyebrow,hero_title,hero_description,hero_image,section_order,sections_visible,featured_product_ids,updated_at) on public.storefront_content to authenticated;
grant all on public.storefront_content to service_role;
create policy "Inicio lectura publica" on public.storefront_content for select to anon,authenticated using(id='home');
create policy "Inicio edicion administradora" on public.storefront_content for update to authenticated using((select tienda_security.is_admin())) with check(id='home' and (select tienda_security.is_admin()));
create or replace function public.storefront_admin_authorized() returns boolean language sql stable security invoker set search_path=pg_catalog,pg_temp as $$ select coalesce(tienda_security.is_admin(),false) $$;
revoke all on function public.storefront_admin_authorized() from public,anon,authenticated;
grant execute on function public.storefront_admin_authorized() to authenticated;

DO $verify$
DECLARE obj text;
BEGIN
 FOREACH obj IN ARRAY ARRAY['checkout_settings','checkout_orders','mp_webhook_events','checkout_rate_windows','checkout_order_customers','checkout_order_events','checkout_email_outbox','storefront_content'] LOOP
  IF to_regclass('public.'||obj) IS NULL OR NOT(
   SELECT c.relrowsecurity FROM pg_catalog.pg_class c WHERE c.oid=('public.'||obj)::regclass) THEN
   RAISE EXCEPTION 'ABORT: RLS o tabla faltante (%)',obj;
  END IF;
 END LOOP;
 IF (SELECT payments_enabled FROM public.checkout_settings WHERE id='default') IS DISTINCT FROM false
    OR EXISTS(SELECT 1 FROM public.productos WHERE checkout_habilitado IS TRUE) THEN
  RAISE EXCEPTION 'ABORT: pagos o compras habilitadas inesperadamente';
 END IF;
END;
$verify$;

COMMIT;
