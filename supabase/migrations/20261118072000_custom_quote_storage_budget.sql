-- Límite agregado de almacenamiento de referencia para la tienda de pruebas (200 MB).
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
 perform pg_advisory_xact_lock(hashtext('custom_quote_sandbox_storage_quota'));
 select coalesce(sum(byte_size),0) into v_global_total from public.custom_quote_files;
 if v_global_total+p_size>209715200 then raise exception 'sandbox_storage_quota_reached'; end if;

 insert into public.custom_quote_files(request_id,storage_path,original_name,mime_type,byte_size)
 values(q.id,p_path,p_name,p_mime,p_size) returning id into v_id;
 return v_id;
end $$;
