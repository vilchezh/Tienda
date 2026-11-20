-- Sandbox-only rollout of admin TOTP MFA.
-- Existing admins can enroll without getting locked out. Once a TOTP factor is
-- verified for that admin, every RLS permission protected by is_admin() requires
-- an active aal2 session from Supabase Auth (server-side, not only JavaScript).
-- Do not apply to production without a separate authorization and recovery plan.
create or replace function tienda_security.is_admin()
returns boolean language sql stable security definer
set search_path=tienda_security,pg_temp as $$
 select exists (
   select 1 from tienda_security.admins a where a.user_id = (select auth.uid())
 )
 and (
   (select auth.jwt()->>'aal')='aal2'
   or not exists (
     select 1 from auth.mfa_factors f
     where f.user_id=(select auth.uid()) and f.status='verified' and f.factor_type='totp'
   )
 );
$$;
comment on function tienda_security.is_admin() is
'Admin membership plus AAL2 whenever the user has a verified TOTP factor. Sandbox.';
