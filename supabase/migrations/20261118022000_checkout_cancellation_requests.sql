-- Issue #5: registro de arrepentimiento. Solo aplicar en Supabase sandbox.
begin;
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
commit;
