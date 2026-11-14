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
