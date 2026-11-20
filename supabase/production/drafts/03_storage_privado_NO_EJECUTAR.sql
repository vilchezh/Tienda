-- BORRADOR PRODUCCION / NO AUTORIZADO PARA EJECUTAR.
-- Depósito PRIVADO para referencias de presupuestos. NO toca el bucket público tienda.
-- Ejecutar solo con backup verificado, etapa 02 comprobada y autorización por separado.
BEGIN;
DO $guard$
BEGIN
 IF to_regclass('public.custom_quote_files') IS NULL OR
    NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class
      WHERE oid='public.custom_quote_files'::regclass AND relrowsecurity) THEN
   RAISE EXCEPTION 'ABORT: esquema privado de presupuestos no está listo con RLS';
 END IF;
 IF EXISTS(SELECT 1 FROM storage.buckets WHERE id='quote-reference') THEN
   RAISE EXCEPTION 'ABORT: bucket existente; no cambiar ni reutilizar automáticamente';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname='storage'
      AND tablename='objects'
      AND policyname='Admin lee referencias privadas de presupuestos producción') THEN
   RAISE EXCEPTION 'ABORT: la política ya existe; conciliar manualmente';
 END IF;
END;
$guard$;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('quote-reference','quote-reference',false,5242880,
  ARRAY['image/jpeg','image/png','image/webp','application/pdf']);

CREATE POLICY "Admin lee referencias privadas de presupuestos producción"
ON storage.objects FOR SELECT TO authenticated
USING(bucket_id='quote-reference' AND (SELECT tienda_security.is_admin()));

DO $verify$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM storage.buckets
   WHERE id='quote-reference' AND public IS FALSE
      AND file_size_limit=5242880) THEN
   RAISE EXCEPTION 'ABORT: almacenamiento privado no configurado';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_policies WHERE
    schemaname='storage' AND tablename='objects'
    AND policyname='Admin lee referencias privadas de presupuestos producción') THEN
   RAISE EXCEPTION 'ABORT: política de acceso administrativo faltante';
 END IF;
END;
$verify$;
COMMIT;
