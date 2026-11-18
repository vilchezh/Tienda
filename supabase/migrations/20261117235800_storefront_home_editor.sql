-- Issue #5: content editor, one public row, role-restricted writes. SANDBOX ONLY.
-- Not automatically applied; requires reviewed migration before enabling editor.
begin;
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
commit;
