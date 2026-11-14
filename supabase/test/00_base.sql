-- SOLO proyecto Supabase nuevo y vacío de pruebas. Ejecutar antes de la migración checkout.
create schema if not exists tienda_security;
create table tienda_security.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
revoke all on schema tienda_security from public, anon, authenticated;
revoke all on tienda_security.admins from public, anon, authenticated;

create function tienda_security.is_admin() returns boolean
language sql stable security definer set search_path = tienda_security, pg_temp as $$
  select exists (select 1 from tienda_security.admins where user_id = (select auth.uid()));
$$;
revoke all on function tienda_security.is_admin() from public, anon;
grant usage on schema tienda_security to authenticated;
grant execute on function tienda_security.is_admin() to authenticated;

create table public.productos (
  id text primary key,
  nombre text not null,
  sku text not null,
  categoria text not null default 'Pruebas',
  subcategoria text not null default '',
  precio_base bigint not null check (precio_base >= 0),
  precio_anterior bigint,
  resumen text not null default '',
  imagen text not null default '',
  fotos jsonb not null default '[]',
  glb text not null default '',
  mp_link text not null default '',
  permitir_nota_medida boolean not null default true,
  maderas jsonb not null default '[]',
  tonos_madera jsonb not null default '[]',
  colores_metal jsonb not null default '[]',
  acabados jsonb not null default '[]',
  extras jsonb not null default '[]',
  activo boolean not null default false
);
alter table public.productos enable row level security;
create policy "Catalogo activo visible" on public.productos for select to anon, authenticated using (activo);
create policy "Administrador gestiona catalogo" on public.productos for all to authenticated
  using ((select tienda_security.is_admin())) with check ((select tienda_security.is_admin()));
grant select on public.productos to anon, authenticated;
grant insert, update, delete on public.productos to authenticated;
grant all on public.productos to service_role;
