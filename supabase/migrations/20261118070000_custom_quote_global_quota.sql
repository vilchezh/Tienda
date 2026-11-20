-- Límite global de 10 nuevos presupuestos al día en sandbox (además de tres por IP/email por hora).
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
