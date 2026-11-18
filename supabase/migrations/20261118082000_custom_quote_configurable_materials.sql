-- Solo para Supabase sandbox: opciones editables y preferencias separadas por material.
begin;
alter table public.custom_quote_requests drop constraint if exists custom_quote_requests_project_type_check;
alter table public.custom_quote_requests add constraint custom_quote_requests_project_type_check
 check(project_type in ('mueble','estructura','parrilla','accesorio','otro'));
alter table public.custom_quote_requests add column quote_preferences jsonb not null default '{}'::jsonb
 check(jsonb_typeof(quote_preferences)='object' and octet_length(quote_preferences::text)<=1800);

create function public.custom_quote_option_list_valid(input text[]) returns boolean
language sql immutable set search_path=pg_catalog,pg_temp as $$
 select coalesce(cardinality(input) between 1 and 20,false)
    and not exists(select 1 from unnest(input) v
      where v is null or length(btrim(v)) not between 1 and 70 or v<>btrim(v))
    and (select count(*) from unnest(input) v) =
        (select count(distinct lower(v)) from unnest(input) v);
$$;
revoke all on function public.custom_quote_option_list_valid(text[]) from public,anon,authenticated;

create table public.custom_quote_options(
 id text primary key default 'default' check(id='default'),
 metal_materials text[] not null default array[
   'Caño estructural 20×20 mm','Caño estructural 30×30 mm',
   'Caño estructural 40×40 mm','Caño estructural 50×50 mm',
   'Ángulo de hierro','Chapa lisa','Malla metálica'],
 wood_materials text[] not null default array[
   'Pino 20 mm','Pino 30 mm','Eucalipto 20 mm',
   'Eucalipto 30 mm','Contrachapado 18 mm'],
 metal_colors text[] not null default array['Negro','Blanco','Gris grafito','Rojo','Verde'],
 metal_finishes text[] not null default array['Mate','Satinado','Brillante'],
 wood_tones text[] not null default array['Natural','Roble claro','Roble oscuro','Nogal','Wengué'],
 wood_finishes text[] not null default array['Mate','Satinado','Brillante'],
 updated_at timestamptz not null default now(),
 constraint valid_quote_option_lists check(
  public.custom_quote_option_list_valid(metal_materials) and
  public.custom_quote_option_list_valid(wood_materials) and
  public.custom_quote_option_list_valid(metal_colors) and
  public.custom_quote_option_list_valid(metal_finishes) and
  public.custom_quote_option_list_valid(wood_tones) and
  public.custom_quote_option_list_valid(wood_finishes))
);
insert into public.custom_quote_options(id) values('default') on conflict(id) do nothing;
alter table public.custom_quote_options enable row level security;
revoke all on public.custom_quote_options from public,anon,authenticated;
grant select on public.custom_quote_options to anon,authenticated;
grant update(metal_materials,wood_materials,metal_colors,metal_finishes,wood_tones,wood_finishes,updated_at)
 on public.custom_quote_options to authenticated;
grant all on public.custom_quote_options to service_role;
create policy "Visitantes consultan opciones de presupuesto" on public.custom_quote_options
 for select to anon,authenticated using(id='default');
create policy "Administradores editan opciones de presupuesto" on public.custom_quote_options
 for update to authenticated using((select tienda_security.is_admin()))
 with check((select tienda_security.is_admin()));

create or replace function public.custom_quote_create(
 p_submission_id uuid,p_token_hash text,p_ip_key text,p_email_key text,
 p_name text,p_email text,p_phone text,p_city text,p_project_type text,p_description text,
 p_measurements text,p_materials text,p_finish text,p_quantity integer,p_desired_date date,
 p_budget bigint,p_delivery text
) returns table(quote_id uuid,quote_code text,quote_status text)
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare existing public.custom_quote_requests%rowtype;
 v_window timestamptz;v_key text;v_count int;
begin
 if p_submission_id is null or p_token_hash !~ '^[a-f0-9]{64}$' or p_ip_key !~ '^[a-f0-9]{64}$'
    or p_email_key !~ '^[a-f0-9]{64}$' or char_length(trim(coalesce(p_name,''))) not between 2 and 120
    or char_length(trim(coalesce(p_email,''))) not between 3 and 254
    or char_length(trim(coalesce(p_phone,''))) not between 7 and 30
    or char_length(trim(coalesce(p_city,''))) not between 2 and 100
    or p_project_type not in ('mueble','estructura','parrilla','accesorio','otro')
    or char_length(trim(coalesce(p_description,''))) not between 20 and 2000
    or char_length(coalesce(p_measurements,''))>250
    or char_length(coalesce(p_materials,''))>250
    or char_length(coalesce(p_finish,''))>180
    or p_quantity not between 1 and 100
    or p_delivery not in ('retiro','envio','instalacion','a_coordinar')
    or (p_budget is not null and p_budget not between 0 and 999999999) then
  raise exception 'invalid_quote';
 end if;
 select * into existing from public.custom_quote_requests q where q.submission_id=p_submission_id;
 if found then
  if existing.token_hash <> p_token_hash or existing.email<>lower(trim(p_email)) then raise exception 'collision'; end if;
  return query select existing.id,existing.code,existing.status; return;
 end if;
 v_window=to_timestamp(floor(extract(epoch from now())/3600)*3600);
 foreach v_key in array array[p_ip_key,p_email_key] loop
  insert into public.custom_quote_rate(key_hash,window_start,requests) values(v_key,v_window,1)
  on conflict(key_hash,window_start) do update set requests=public.custom_quote_rate.requests+1
  returning requests into v_count;
  if v_count>3 then raise exception 'too_many_requests' using errcode='P0001'; end if;
 end loop;
 -- Cuota global de sandbox: evita agotar almacenamiento rotando IP y correo.
 insert into public.custom_quote_rate(key_hash,window_start,requests)
 values(repeat(md5('custom_quote_sandbox_global_'||current_date::text),2),date_trunc('day',now()),1)
 on conflict(key_hash,window_start) do update set requests=public.custom_quote_rate.requests+1
 returning requests into v_count;
 if v_count>10 then raise exception 'sandbox_daily_quota_reached'; end if;
 delete from public.custom_quote_rate where window_start<now()-interval '48 hours';
 insert into public.custom_quote_requests(submission_id,token_hash,full_name,email,phone,city,
  project_type,description,measurements,materials,finish,quantity,desired_date,budget_ars,delivery)
 values(p_submission_id,p_token_hash,trim(p_name),lower(trim(p_email)),trim(p_phone),trim(p_city),
  p_project_type,trim(p_description),coalesce(trim(p_measurements),''),coalesce(trim(p_materials),''),
  coalesce(trim(p_finish),''),p_quantity,p_desired_date,p_budget,p_delivery)
 returning id,code,status into quote_id,quote_code,quote_status;
 return next;
end $$;


-- Validar de manera atómica el resumen y las elecciones de materiales.
create function public.custom_quote_create_v2(
 p_submission_id uuid,p_token_hash text,p_ip_key text,p_email_key text,
 p_name text,p_email text,p_phone text,p_city text,p_project_type text,p_description text,
 p_measurements text,p_materials text,p_finish text,p_quantity integer,p_desired_date date,
 p_budget bigint,p_delivery text,p_choices jsonb
) returns table(quote_id uuid,quote_code text,quote_status text)
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare k text; v jsonb; candidate text; result record;
begin
 if p_choices is null or jsonb_typeof(p_choices)<>'object' or octet_length(p_choices::text)>1800
    or p_delivery='instalacion' then
   raise exception 'invalid_quote_choices';
 end if;
 foreach k in array array['metal_materials','wood_materials'] loop
   v:=p_choices->k;
   if v is null or jsonb_typeof(v)<>'array' or jsonb_array_length(v)>8 then
     raise exception 'invalid_quote_materials';
   end if;
   if exists(select 1 from jsonb_array_elements(v) item
             where jsonb_typeof(item)<>'string' or length(trim(item#>>'{}')) not between 1 and 70)
   then raise exception 'invalid_quote_materials'; end if;
 end loop;
 foreach k in array array['metal_color','metal_finish','wood_tone','wood_finish'] loop
   v:=p_choices->k;
   if v is null or jsonb_typeof(v)<>'string' or length(v#>>'{}')>70 then
      raise exception 'invalid_quote_finish';
   end if;
 end loop;
 select * into result from public.custom_quote_create(
   p_submission_id,p_token_hash,p_ip_key,p_email_key,p_name,p_email,p_phone,p_city,
   p_project_type,p_description,p_measurements,p_materials,p_finish,
   p_quantity,p_desired_date,p_budget,p_delivery
 );
 update public.custom_quote_requests
 set quote_preferences=p_choices
 where id=result.quote_id and status='draft' and quote_preferences='{}'::jsonb;
 return query select result.quote_id::uuid,result.quote_code::text,result.quote_status::text;
end $$;
revoke all on function public.custom_quote_create_v2(uuid,text,text,text,text,text,text,text,text,text,text,text,text,integer,date,bigint,text,jsonb)
 from public,anon,authenticated;
grant execute on function public.custom_quote_create_v2(uuid,text,text,text,text,text,text,text,text,text,text,text,text,integer,date,bigint,text,jsonb)
 to service_role;
commit;