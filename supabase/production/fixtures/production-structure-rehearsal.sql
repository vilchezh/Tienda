-- Fixture aislada de PostgreSQL 17, JAMAS instalar en Supabase original.
-- No contiene credenciales reales ni clientes.
DO $roles$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END;
$roles$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
CREATE SCHEMA tienda_security;
CREATE TABLE tienda_security.admins(user_id uuid PRIMARY KEY);
INSERT INTO tienda_security.admins(user_id) VALUES('00000000-0000-4000-8000-000000000001');
REVOKE ALL ON SCHEMA tienda_security FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA tienda_security TO authenticated;
CREATE FUNCTION tienda_security.is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM tienda_security.admins WHERE user_id=(SELECT auth.uid()));
$$;
REVOKE ALL ON FUNCTION tienda_security.is_admin() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION tienda_security.is_admin() TO authenticated;
CREATE TABLE public.productos(
 id text PRIMARY KEY, nombre text NOT NULL, sku text NOT NULL,
 activo boolean DEFAULT true, categoria text NOT NULL, subcategoria text NOT NULL,
 precio_base numeric NOT NULL, resumen text, imagen text, fotos jsonb DEFAULT '[]'::jsonb, glb text,
 maderas jsonb DEFAULT '[]'::jsonb, tonos_madera jsonb DEFAULT '[]'::jsonb,
 colores_metal jsonb DEFAULT '[]'::jsonb, acabados jsonb DEFAULT '[]'::jsonb, extras jsonb DEFAULT '[]'::jsonb
);
ALTER TABLE public.productos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lectura de productos activos" ON public.productos FOR SELECT TO anon,authenticated USING(activo IS TRUE);
CREATE POLICY "Solo administradores gestionan productos" ON public.productos FOR ALL TO authenticated USING((SELECT tienda_security.is_admin())) WITH CHECK((SELECT tienda_security.is_admin()));
GRANT SELECT,INSERT,UPDATE ON public.productos TO anon,authenticated;
INSERT INTO public.productos(id,nombre,sku,activo,categoria,subcategoria,precio_base) VALUES
('producto-fixture','Producto ficticio para pruebas','TEST-001',true,'pruebas','fixtures',100000);
CREATE TABLE public.stock_taller (id text PRIMARY KEY,data jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
INSERT INTO public.stock_taller(id,data) VALUES('fixtures','{"test":true}');
ALTER TABLE public.stock_taller ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Stock administracion exclusiva" ON public.stock_taller FOR ALL TO authenticated USING((SELECT tienda_security.is_admin())) WITH CHECK((SELECT tienda_security.is_admin()));
