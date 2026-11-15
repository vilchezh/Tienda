-- Administración de pedidos y datos de compradores para el sandbox.
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
-- migración ya se hubiese evaluado manualmente en un sandbox.
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
