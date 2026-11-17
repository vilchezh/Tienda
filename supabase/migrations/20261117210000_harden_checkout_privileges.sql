-- Issue #4: revocar privilegios estructurales innecesarios observados en sandbox.
-- No toca datos, estados, políticas RLS, SELECT, INSERT ni los permisos UPDATE vigentes.
-- PostgreSQL 17 / Supabase. Ejecutar sólo en pacyytbscnlklyrhsshp tras revisión.
begin;

revoke truncate, trigger, references, maintain
  on table public.checkout_orders, public.checkout_settings
  from public, anon, authenticated;

do $$
declare
  target text;
  role_name text;
  privilege text;
begin
  foreach target in array array['public.checkout_orders','public.checkout_settings'] loop
    foreach role_name in array array['anon','authenticated'] loop
      foreach privilege in array array['TRUNCATE','TRIGGER','REFERENCES','MAINTAIN'] loop
        if has_table_privilege(role_name, target, privilege) then
          raise exception 'Unexpected checkout permission: % on % for %',
            privilege, target, role_name;
        end if;
      end loop;
    end loop;
  end loop;
  if not has_table_privilege('anon','public.checkout_settings','SELECT')
     or not has_table_privilege('authenticated','public.checkout_settings','SELECT')
     or not has_table_privilege('authenticated','public.checkout_orders','SELECT')
     or not has_column_privilege('authenticated','public.checkout_orders','manufacturing_status','UPDATE')
     or not has_column_privilege('authenticated','public.checkout_orders','internal_notes','UPDATE') then
    raise exception 'Required checkout read / admin edit privileges changed unexpectedly';
  end if;
end $$;

commit;
