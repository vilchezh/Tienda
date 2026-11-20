-- Issue #7: presupuestos a medida; proyecto de prueba exclusivamente.
-- Los clientes no reciben acceso directo a Data API ni Storage.
begin;
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

-- Depósito aislado; nunca se publica ni se conceden privilegios de subida directa a visitantes.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('quote-reference-sandbox','quote-reference-sandbox',false,5242880,
  array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict(id) do nothing;

commit;