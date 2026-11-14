-- Checkout Pro de prueba. Este archivo se versiona, pero no se aplica automáticamente.
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
