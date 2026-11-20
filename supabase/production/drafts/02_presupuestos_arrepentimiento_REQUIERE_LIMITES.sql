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

 IF to_regclass('public.checkout_settings') IS NULL
    OR to_regclass('public.checkout_orders') IS NULL
    OR (SELECT payments_enabled FROM public.checkout_settings WHERE id='default') IS DISTINCT FROM false THEN
  RAISE EXCEPTION 'ABORT: primero instalar checkout; pagos deben estar apagados';
 END IF;
 FOREACH obj IN ARRAY ARRAY['public.checkout_cancellation_requests','public.checkout_cancellation_rate','public.checkout_cancellation_emails','public.checkout_cancellation_events','public.custom_quote_requests','public.custom_quote_files','public.custom_quote_rate','public.custom_quote_emails','public.custom_quote_events','public.custom_quote_options'] LOOP
  IF to_regclass(obj) IS NOT NULL THEN
   RAISE EXCEPTION 'ABORT: objeto existente (%); requiere conciliación manual',obj;
  END IF;
 END LOOP;
END;
$preflight$;

-- SOURCE: supabase/migrations/20261118022000_checkout_cancellation_requests.sql
create sequence if not exists public.checkout_cancellation_number_seq;
revoke all on sequence public.checkout_cancellation_number_seq from public,anon,authenticated;
grant usage on sequence public.checkout_cancellation_number_seq to service_role;

create table public.checkout_cancellation_requests (
 id uuid primary key default gen_random_uuid(),
 submission_id uuid not null unique,
 code text not null unique default ('ARR-'||to_char(now(),'YYYY')||'-'||lpad(nextval('public.checkout_cancellation_number_seq')::text,6,'0')),
 access_token_hash text not null check(access_token_hash ~ '^[a-f0-9]{64}$'),
 customer_email text not null check(char_length(customer_email) between 3 and 254),
 order_reference text not null default '' check(char_length(order_reference)<=120),
 order_id uuid references public.checkout_orders(id) on delete set null,
 message text not null default '' check(char_length(message)<=500),
 status text not null default 'received' check(status in ('received','reviewing','approved','denied','closed')),
 admin_note text not null default '' check(char_length(admin_note)<=1000),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index checkout_cancellation_created_idx on public.checkout_cancellation_requests(created_at desc);
create index checkout_cancellation_status_idx on public.checkout_cancellation_requests(status,created_at desc);
create table public.checkout_cancellation_rate (
 key_hash text not null check(key_hash ~ '^[a-f0-9]{64}$'),
 window_start timestamptz not null,
 requests integer not null default 1,
 primary key(key_hash,window_start)
);
create table public.checkout_cancellation_emails (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null references public.checkout_cancellation_requests(id) on delete cascade,
 recipient_type text not null check(recipient_type in ('customer','seller')),
 status text not null default 'pending' check(status in ('pending','processing','sent','rejected')),
 attempt_count integer not null default 0 check(attempt_count>=0),
 next_attempt_at timestamptz not null default now(),
 lease_until timestamptz,
 last_error text,
 sent_at timestamptz,
 provider_message_id text,
 created_at timestamptz not null default now(),
 unique(request_id,recipient_type)
);
create index checkout_cancellation_emails_due_idx on public.checkout_cancellation_emails(status,next_attempt_at);
create table public.checkout_cancellation_events (
 id bigint generated always as identity primary key,
 request_id uuid not null references public.checkout_cancellation_requests(id) on delete cascade,
 from_status text not null,
 to_status text not null,
 actor_id uuid,
 created_at timestamptz not null default now()
);
alter table public.checkout_cancellation_requests enable row level security;
alter table public.checkout_cancellation_rate enable row level security;
alter table public.checkout_cancellation_emails enable row level security;
alter table public.checkout_cancellation_events enable row level security;
revoke all on public.checkout_cancellation_requests, public.checkout_cancellation_rate,public.checkout_cancellation_emails,public.checkout_cancellation_events from public,anon,authenticated;
grant select on public.checkout_cancellation_requests,public.checkout_cancellation_emails,public.checkout_cancellation_events to authenticated;
grant update(status,admin_note) on public.checkout_cancellation_requests to authenticated;
grant all on public.checkout_cancellation_requests,public.checkout_cancellation_rate,public.checkout_cancellation_emails,public.checkout_cancellation_events to service_role;
create policy "Admins read cancellation requests" on public.checkout_cancellation_requests for select to authenticated using ((select tienda_security.is_admin()));
create policy "Admins review cancellation requests" on public.checkout_cancellation_requests for update to authenticated using ((select tienda_security.is_admin())) with check ((select tienda_security.is_admin()));
create policy "Admins read cancellation emails" on public.checkout_cancellation_emails for select to authenticated using ((select tienda_security.is_admin()));
create policy "Admins read cancellation audit" on public.checkout_cancellation_events for select to authenticated using ((select tienda_security.is_admin()));

create function public.checkout_audit_cancellation_status() returns trigger
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
 if new.status is distinct from old.status then
  new.updated_at := now();
  insert into public.checkout_cancellation_events(request_id,from_status,to_status,actor_id)
  values(old.id,old.status,new.status,auth.uid());
 end if;
 return new;
end $$;
create trigger checkout_cancellation_audit before update of status on public.checkout_cancellation_requests
for each row execute function public.checkout_audit_cancellation_status();
revoke all on function public.checkout_audit_cancellation_status() from public,anon,authenticated;

-- Registro atómico: idempotencia, límite por correo/IP, y acuses persistidos.
create function public.checkout_register_cancellation(
 p_submission_id uuid,p_token_hash text,p_email text,p_reference text,p_message text,p_ip_hash text,p_email_hash text
) returns table(request_id uuid,request_code text,request_status text,registered_at timestamptz)
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare existing public.checkout_cancellation_requests%rowtype;
        v_order uuid; v_key text; v_count integer; v_window timestamptz;
begin
 if p_submission_id is null or p_token_hash !~ '^[a-f0-9]{64}$' or p_ip_hash !~ '^[a-f0-9]{64}$'
    or p_email_hash !~ '^[a-f0-9]{64}$' or p_email is null or char_length(p_email) not between 3 and 254
    or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or char_length(coalesce(p_reference,''))>120 or char_length(coalesce(p_message,''))>500 then
  raise exception 'invalid cancellation request';
 end if;
 select * into existing from public.checkout_cancellation_requests where submission_id=p_submission_id;
 if found then
  if existing.access_token_hash<>p_token_hash or existing.customer_email<>lower(trim(p_email)) then
   raise exception 'request id collision';
  end if;
  return query select existing.id,existing.code,existing.status,existing.created_at;
  return;
 end if;
 v_window := to_timestamp(floor(extract(epoch from now())/900)*900);
 foreach v_key in array array[p_ip_hash,p_email_hash] loop
  insert into public.checkout_cancellation_rate(key_hash,window_start,requests)
  values(v_key,v_window,1)
  on conflict(key_hash,window_start) do update set requests=public.checkout_cancellation_rate.requests+1
  returning requests into v_count;
  if v_count>5 then raise exception 'too_many_requests'; end if;
 end loop;
 delete from public.checkout_cancellation_rate where window_start < now()-interval '48 hours';
 if coalesce(p_reference,'') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
  select o.id into v_order from public.checkout_orders o
  join public.checkout_order_customers c on c.order_id=o.id
  where o.id=trim(p_reference)::uuid and lower(c.email)=lower(trim(p_email))
  limit 1;
 end if;
 insert into public.checkout_cancellation_requests(submission_id,access_token_hash,customer_email,order_reference,order_id,message)
 values(p_submission_id,p_token_hash,lower(trim(p_email)),coalesce(trim(p_reference),''),v_order,coalesce(trim(p_message),''))
 returning id,code,status,created_at into request_id,request_code,request_status,registered_at;
 insert into public.checkout_cancellation_emails(request_id,recipient_type)
 values(request_id,'customer'),(request_id,'seller');
 return next;
end $$;
revoke all on function public.checkout_register_cancellation(uuid,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.checkout_register_cancellation(uuid,text,text,text,text,text,text) to service_role;

-- Reclamo de trabajos de correo con bloqueo para evitar dobles envíos.
create function public.checkout_claim_cancellation_emails(p_limit integer default 10)
returns table(email_id uuid,req_id uuid,kind text,attempt integer)
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
 return query
 with due as (
  select e.id from public.checkout_cancellation_emails e
  where (e.status='pending' and e.next_attempt_at<=now())
     or (e.status='processing' and e.lease_until<now() and e.created_at>now()-interval '20 hours')
  order by e.created_at for update skip locked limit least(greatest(coalesce(p_limit,10),1),20)
 )
 update public.checkout_cancellation_emails e
 set status='processing',attempt_count=e.attempt_count+1,lease_until=now()+interval '3 minutes'
 from due where e.id=due.id
 returning e.id,e.request_id,e.recipient_type,e.attempt_count;
end $$;
revoke all on function public.checkout_claim_cancellation_emails(integer) from public,anon,authenticated;
grant execute on function public.checkout_claim_cancellation_emails(integer) to service_role;

-- SOURCE: supabase/migrations/20261118060000_custom_quote_requests.sql
-- Los clientes no reciben acceso directo a Data API ni Storage.

create sequence if not exists public.custom_quote_code_seq;
revoke all on sequence public.custom_quote_code_seq from public,anon,authenticated;
grant usage on sequence public.custom_quote_code_seq to service_role;

create table public.custom_quote_requests(
 id uuid primary key default gen_random_uuid(),
 submission_id uuid not null unique,
 code text not null unique default ('COT-'||to_char(now(),'YYYY')||'-'||lpad(nextval('public.custom_quote_code_seq')::text,6,'0')),
 token_hash text not null check(token_hash ~ '^[a-f0-9]{64}$'),
 status text not null default 'draft' check(status in ('draft','new','reviewing','need_info','quoted','accepted','declined','expired')),
 full_name text not null check(char_length(full_name) between 2 and 120),
 email text not null check(char_length(email) between 3 and 254),
 phone text not null check(char_length(phone) between 7 and 30),
 city text not null check(char_length(city) between 2 and 100),
 project_type text not null check(project_type in ('mueble','estructura','parrilla','otro')),
 description text not null check(char_length(description) between 20 and 2000),
 measurements text not null default '' check(char_length(measurements)<=250),
 materials text not null default '' check(char_length(materials)<=250),
 finish text not null default '' check(char_length(finish)<=180),
 quantity integer not null default 1 check(quantity between 1 and 100),
 desired_date date,
 budget_ars bigint check(budget_ars is null or budget_ars between 0 and 999999999),
 delivery text not null check(delivery in ('retiro','envio','instalacion','a_coordinar')),
 admin_note text not null default '' check(char_length(admin_note)<=2000),
 quoted_amount bigint check(quoted_amount is null or quoted_amount between 0 and 999999999),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '24 hours'
);
create index custom_quote_requests_recent_idx on public.custom_quote_requests(created_at desc);
create index custom_quote_requests_state_idx on public.custom_quote_requests(status,created_at desc);

create table public.custom_quote_files(
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null references public.custom_quote_requests(id) on delete cascade,
 storage_path text not null unique check(char_length(storage_path) between 36 and 180),
 original_name text not null check(char_length(original_name) between 1 and 140),
 mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp','application/pdf')),
 byte_size integer not null check(byte_size between 1 and 5242880),
 created_at timestamptz not null default now()
);
create index custom_quote_files_request_idx on public.custom_quote_files(request_id);
create table public.custom_quote_rate(
 key_hash text not null check(key_hash ~ '^[a-f0-9]{64}$'),
 window_start timestamptz not null,
 requests integer not null check(requests between 1 and 1000),
 primary key(key_hash,window_start)
);
create table public.custom_quote_emails(
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null references public.custom_quote_requests(id) on delete cascade,
 recipient_kind text not null check(recipient_kind in ('customer','seller')),
 status text not null default 'pending' check(status in ('pending','processing','sent','rejected')),
 attempts integer not null default 0 check(attempts between 0 and 100),
 next_attempt_at timestamptz not null default now(),
 lease_until timestamptz,
 sent_at timestamptz,
 provider_message_id text,
 last_error text,
 created_at timestamptz not null default now(),
 unique(request_id,recipient_kind)
);
create index custom_quote_emails_due_idx on public.custom_quote_emails(status,next_attempt_at);
create table public.custom_quote_events(
 id bigint generated always as identity primary key,
 request_id uuid not null references public.custom_quote_requests(id) on delete cascade,
 old_status text not null,
 new_status text not null,
 actor_id uuid,
 created_at timestamptz not null default now()
);

alter table public.custom_quote_requests enable row level security;
alter table public.custom_quote_files enable row level security;
alter table public.custom_quote_rate enable row level security;
alter table public.custom_quote_emails enable row level security;
alter table public.custom_quote_events enable row level security;
revoke all on public.custom_quote_requests,public.custom_quote_files,public.custom_quote_rate,
 public.custom_quote_emails,public.custom_quote_events from public,anon,authenticated;
grant select on public.custom_quote_requests,public.custom_quote_files,public.custom_quote_emails,
 public.custom_quote_events to authenticated;
grant update(status,admin_note,quoted_amount) on public.custom_quote_requests to authenticated;
grant all on public.custom_quote_requests,public.custom_quote_files,public.custom_quote_rate,
 public.custom_quote_emails,public.custom_quote_events to service_role;
create policy "Administradores ven presupuestos" on public.custom_quote_requests for select to authenticated
 using ((select tienda_security.is_admin()));
create policy "Administradores gestionan presupuestos" on public.custom_quote_requests for update to authenticated
 using ((select tienda_security.is_admin())) with check ((select tienda_security.is_admin()));
create policy "Administradores ven planos" on public.custom_quote_files for select to authenticated
 using ((select tienda_security.is_admin()));
create policy "Administradores ven avisos" on public.custom_quote_emails for select to authenticated
 using ((select tienda_security.is_admin()));
create policy "Administradores ven auditoría" on public.custom_quote_events for select to authenticated
 using ((select tienda_security.is_admin()));

create function public.custom_quote_audit() returns trigger
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
 if new.status is distinct from old.status then
  new.updated_at=now();
  insert into public.custom_quote_events(request_id,old_status,new_status,actor_id)
  values(old.id,old.status,new.status,auth.uid());
 end if;
 return new;
end $$;
revoke all on function public.custom_quote_audit() from public,anon,authenticated;
create trigger custom_quote_audit_status before update of status on public.custom_quote_requests
 for each row execute function public.custom_quote_audit();

-- Sólo la Edge Function con service_role puede crear un borrador; la operación es idempotente.
create function public.custom_quote_create(
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
    or p_project_type not in ('mueble','estructura','parrilla','otro')
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
 delete from public.custom_quote_rate where window_start<now()-interval '48 hours';
 insert into public.custom_quote_requests(submission_id,token_hash,full_name,email,phone,city,
  project_type,description,measurements,materials,finish,quantity,desired_date,budget_ars,delivery)
 values(p_submission_id,p_token_hash,trim(p_name),lower(trim(p_email)),trim(p_phone),trim(p_city),
  p_project_type,trim(p_description),coalesce(trim(p_measurements),''),coalesce(trim(p_materials),''),
  coalesce(trim(p_finish),''),p_quantity,p_desired_date,p_budget,p_delivery)
 returning id,code,status into quote_id,quote_code,quote_status;
 return next;
end $$;
revoke all on function public.custom_quote_create(uuid,text,text,text,text,text,text,text,text,text,text,text,text,integer,date,bigint,text) from public,anon,authenticated;
grant execute on function public.custom_quote_create(uuid,text,text,text,text,text,text,text,text,text,text,text,text,integer,date,bigint,text) to service_role;

-- Serialización por pedido para limitar adjuntos incluso si hay subidas simultáneas.
create function public.custom_quote_add_file(
 p_quote_id uuid,p_token_hash text,p_path text,p_name text,p_mime text,p_size integer
) returns uuid
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare q public.custom_quote_requests%rowtype;v_count integer;v_total bigint;v_id uuid;
begin
 select * into q from public.custom_quote_requests where id=p_quote_id for update;
 if not found or q.token_hash<>p_token_hash or q.status<>'draft' or q.expires_at<now()
   or p_mime not in ('image/jpeg','image/png','image/webp','application/pdf')
   or p_size not between 1 and 5242880
   or char_length(coalesce(p_name,'')) not between 1 and 140
   or p_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp|pdf)$'
   or split_part(p_path,'/',1)<>q.id::text then
   raise exception 'invalid_or_expired_upload';
 end if;
 select count(*),coalesce(sum(byte_size),0) into v_count,v_total
 from public.custom_quote_files where request_id=q.id;
 if v_count>=5 or v_total+p_size>26214400 then raise exception 'upload_limit_reached'; end if;
 insert into public.custom_quote_files(request_id,storage_path,original_name,mime_type,byte_size)
 values(q.id,p_path,p_name,p_mime,p_size) returning id into v_id;
 return v_id;
end $$;
revoke all on function public.custom_quote_add_file(uuid,text,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.custom_quote_add_file(uuid,text,text,text,text,integer) to service_role;

create function public.custom_quote_finish(p_quote_id uuid,p_token_hash text)
 returns table(quote_code text,quote_status text)
 language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare q public.custom_quote_requests%rowtype;
begin
 select * into q from public.custom_quote_requests where id=p_quote_id for update;
 if not found or q.token_hash<>p_token_hash then raise exception 'invalid_request'; end if;
 if q.status='draft' and q.expires_at>=now() then
  update public.custom_quote_requests set status='new',updated_at=now() where id=q.id;
  insert into public.custom_quote_emails(request_id,recipient_kind)
  values(q.id,'customer'),(q.id,'seller') on conflict do nothing;
  q.status='new';
 elsif q.status='draft' then
  raise exception 'expired_draft';
 end if;
 return query select q.code,q.status;
end $$;
revoke all on function public.custom_quote_finish(uuid,text) from public,anon,authenticated;
grant execute on function public.custom_quote_finish(uuid,text) to service_role;

-- Trabajos de correo: lease y clave fija para idempotencia en Resend.
create function public.custom_quote_claim_emails(p_limit integer default 10)
 returns table(email_id uuid,quote_id uuid,kind text,attempt integer)
 language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
 return query with due as (
  select e.id from public.custom_quote_emails e
  where (e.status='pending' and e.next_attempt_at<=now())
     or (e.status='processing' and e.lease_until<now() and e.created_at>now()-interval '20 hours')
  order by e.created_at for update skip locked limit least(greatest(coalesce(p_limit,10),1),20)
 )
 update public.custom_quote_emails e
 set status='processing',attempts=e.attempts+1,lease_until=now()+interval '3 minutes'
 from due where e.id=due.id
 returning e.id,e.request_id,e.recipient_kind,e.attempts;
end $$;
revoke all on function public.custom_quote_claim_emails(integer) from public,anon,authenticated;
grant execute on function public.custom_quote_claim_emails(integer) to service_role;

-- SOURCE: supabase/migrations/20261118070000_custom_quote_global_quota.sql
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
    or p_project_type not in ('mueble','estructura','parrilla','otro')
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
 values(repeat(md5('custom_quote_production_global_'||current_date::text),2),date_trunc('day',now()),1)
 on conflict(key_hash,window_start) do update set requests=public.custom_quote_rate.requests+1
 returning requests into v_count;
 if v_count>__QUOTE_MAX_DAILY__ then raise exception 'daily_quota_reached'; end if;
 delete from public.custom_quote_rate where window_start<now()-interval '48 hours';
 insert into public.custom_quote_requests(submission_id,token_hash,full_name,email,phone,city,
  project_type,description,measurements,materials,finish,quantity,desired_date,budget_ars,delivery)
 values(p_submission_id,p_token_hash,trim(p_name),lower(trim(p_email)),trim(p_phone),trim(p_city),
  p_project_type,trim(p_description),coalesce(trim(p_measurements),''),coalesce(trim(p_materials),''),
  coalesce(trim(p_finish),''),p_quantity,p_desired_date,p_budget,p_delivery)
 returning id,code,status into quote_id,quote_code,quote_status;
 return next;
end $$;

-- SOURCE: supabase/migrations/20261118072000_custom_quote_storage_budget.sql
create or replace function public.custom_quote_add_file(
 p_quote_id uuid,p_token_hash text,p_path text,p_name text,p_mime text,p_size integer
) returns uuid
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare q public.custom_quote_requests%rowtype;v_count integer;v_total bigint;v_global_total bigint;v_id uuid;
begin
 select * into q from public.custom_quote_requests where id=p_quote_id for update;
 if not found or q.token_hash<>p_token_hash or q.status<>'draft' or q.expires_at<now()
   or p_mime not in ('image/jpeg','image/png','image/webp','application/pdf')
   or p_size not between 1 and 5242880
   or char_length(coalesce(p_name,'')) not between 1 and 140
   or p_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp|pdf)$'
   or split_part(p_path,'/',1)<>q.id::text then
   raise exception 'invalid_or_expired_upload';
 end if;
 select count(*),coalesce(sum(byte_size),0) into v_count,v_total
 from public.custom_quote_files where request_id=q.id;
 if v_count>=5 or v_total+p_size>26214400 then raise exception 'upload_limit_reached'; end if;
 -- Tope total de 200 MB para el depósito completo del sandbox, sin costos inesperados.
 perform pg_advisory_xact_lock(hashtext('custom_quote_production_storage_quota'));
 select coalesce(sum(byte_size),0) into v_global_total from public.custom_quote_files;
 if v_global_total+p_size>__QUOTE_STORAGE_MAX_BYTES__ then raise exception 'storage_quota_reached'; end if;

 insert into public.custom_quote_files(request_id,storage_path,original_name,mime_type,byte_size)
 values(q.id,p_path,p_name,p_mime,p_size) returning id into v_id;
 return v_id;
end $$;

-- SOURCE: supabase/migrations/20261118082000_custom_quote_configurable_materials.sql
alter table public.custom_quote_requests drop constraint if exists custom_quote_requests_project_type_check;
alter table public.custom_quote_requests add constraint custom_quote_requests_project_type_check
 check(project_type in ('mueble','estructura','parrilla','accesorio','otro'));
alter table public.custom_quote_requests add column quote_preferences jsonb not null default '{}'::jsonb
 check(jsonb_typeof(quote_preferences)='object' and octet_length(quote_preferences::text)<=1800);

create function public.custom_quote_option_list_valid(input text[]) returns boolean
language sql immutable set search_path=pg_catalog,pg_temp as $$
 select coalesce(cardinality(input) between 1 and 20,false)
    and not exists(select 1 from unnest(input) as item(value)
      where item.value is null or length(btrim(item.value)) not between 1 and 70 or item.value<>btrim(item.value))
    and (select count(*) from unnest(input) as item(value)) =
        (select count(distinct lower(item.value)) from unnest(input) as item(value));
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
 values(repeat(md5('custom_quote_production_global_'||current_date::text),2),date_trunc('day',now()),1)
 on conflict(key_hash,window_start) do update set requests=public.custom_quote_rate.requests+1
 returning requests into v_count;
 if v_count>__QUOTE_MAX_DAILY__ then raise exception 'daily_quota_reached'; end if;
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
   if exists(select 1 from jsonb_array_elements(v) as item(value)
             where jsonb_typeof(item.value)<>'string' or length(trim(item.value#>>'{}')) not between 1 and 70)
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

-- SOURCE: supabase/migrations/20261118083000_custom_quote_options_validator_grants.sql
-- Permitimos ejecutar el validador de opciones durante UPDATE, sin dar permisos de edición a visitantes.
grant execute on function public.custom_quote_option_list_valid(text[]) to authenticated,service_role;

DO $verify$
DECLARE obj text;
BEGIN
 FOREACH obj IN ARRAY ARRAY['checkout_cancellation_requests','checkout_cancellation_rate','checkout_cancellation_emails','checkout_cancellation_events','custom_quote_requests','custom_quote_files','custom_quote_rate','custom_quote_emails','custom_quote_events','custom_quote_options'] LOOP
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
