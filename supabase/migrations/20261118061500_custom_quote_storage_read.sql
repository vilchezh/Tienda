-- Sólo administradores autenticados pueden descargar referencias del depósito privado.
-- No se permite subir, sobrescribir, borrar ni listar a visitantes anónimos.
create policy "Administradores descargan referencias privadas de presupuestos"
on storage.objects for select to authenticated
using (bucket_id='quote-reference-sandbox' and (select tienda_security.is_admin()));