-- Bucket público SOLO para imágenes y modelos publicados, no para datos de clientes.
-- Apto para ambos entornos. Nunca se mezcla con quote-reference-sandbox.
begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('tienda','tienda',true,31457280,
 array['image/jpeg','image/png','image/webp','model/gltf-binary'])
on conflict(id) do nothing;

create policy "Administradores cargan recursos públicos validados de la tienda"
 on storage.objects for insert to authenticated
 with check (
  bucket_id='tienda'
  and (select tienda_security.is_admin())
  and ((storage.foldername(name))[1] in ('portadas','fotos','texturas','modelos','home'))
  and (
   ((storage.foldername(name))[1]='modelos' and lower(storage.extension(name))='glb')
   or ((storage.foldername(name))[1]<>'modelos' and lower(storage.extension(name)) in ('jpg','jpeg','png','webp'))
  )
 );
-- GET de los recursos publicados se sirve mediante el bucket público;
-- no se concede a compradores listar objetos ni modificar archivos.
create policy "Administradores listan recursos públicos de la tienda"
 on storage.objects for select to authenticated
 using(bucket_id='tienda' and (select tienda_security.is_admin()));
commit;