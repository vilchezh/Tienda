-- Paginación/filtrado administrativo e identificación de rechazos permanentes.
-- Se prepara para el sandbox y no se aplica automáticamente.

alter table public.checkout_email_outbox
  drop constraint if exists checkout_email_outbox_status_check;
alter table public.checkout_email_outbox
  add constraint checkout_email_outbox_status_check
  check (status in ('pending', 'processing', 'sent', 'failed', 'rejected', 'uncertain'));

create index if not exists checkout_orders_payment_created_idx
  on public.checkout_orders(payment_status, created_at desc);

create or replace function public.checkout_admin_list_orders(
  p_search text default null,
  p_payment_group text default 'all',
  p_payment_status text default null,
  p_manufacturing_status text default null,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null,
  p_sort text default 'desc',
  p_limit integer default 50,
  p_offset integer default 0
)
returns table(order_data jsonb, total_count bigint)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with filtered as (
    select
      o.*,
      c.order_id as customer_order_id,
      c.full_name as customer_full_name,
      c.email as customer_email,
      c.phone as customer_phone,
      c.delivery_method as customer_delivery_method,
      c.address_line as customer_address_line,
      c.city as customer_city,
      c.province as customer_province,
      c.postal_code as customer_postal_code,
      c.delivery_notes as customer_delivery_notes,
      c.retention_until as customer_retention_until
    from public.checkout_orders o
    left join public.checkout_order_customers c on c.order_id = o.id
    where (select tienda_security.is_admin())
      and (
        nullif(trim(p_search), '') is null or
        o.id::text ilike '%' || left(trim(p_search), 120) || '%' or
        coalesce(o.mp_order_id, '') ilike '%' || left(trim(p_search), 120) || '%' or
        o.product_id ilike '%' || left(trim(p_search), 120) || '%' or
        coalesce(o.product_snapshot->>'nombre', '') ilike '%' || left(trim(p_search), 120) || '%' or
        coalesce(o.product_snapshot->>'sku', '') ilike '%' || left(trim(p_search), 120) || '%' or
        coalesce(c.full_name, '') ilike '%' || left(trim(p_search), 120) || '%' or
        coalesce(c.email, '') ilike '%' || left(trim(p_search), 120) || '%'
      )
      and (
        coalesce(p_payment_group, 'all') = 'all' or
        (p_payment_group = 'accredited' and coalesce(o.payment_status, o.status, 'created') = 'processed') or
        (p_payment_group = 'unpaid' and coalesce(o.payment_status, o.status, 'created') in ('created', 'failed', 'canceled')) or
        (p_payment_group = 'processing' and coalesce(o.payment_status, o.status, 'created') in ('processing', 'action_required', 'manual_review')) or
        (p_payment_group = 'refunded' and coalesce(o.payment_status, o.status, 'created') in ('refunded', 'partially_refunded', 'charged_back'))
      )
      and (p_payment_status is null or coalesce(o.payment_status, o.status, 'created') = p_payment_status)
      and (p_manufacturing_status is null or o.manufacturing_status = p_manufacturing_status)
      and (p_date_from is null or o.created_at >= p_date_from)
      and (p_date_to is null or o.created_at < p_date_to)
  ), counted as (
    select filtered.*, count(*) over () as filtered_count
    from filtered
  )
  select
    jsonb_build_object(
      'id', result.id,
      'product_id', result.product_id,
      'product_snapshot', result.product_snapshot,
      'selection_snapshot', result.selection_snapshot,
      'total_amount', result.total_amount,
      'currency', result.currency,
      'status', result.status,
      'payment_status', result.payment_status,
      'status_detail', result.status_detail,
      'mp_order_id', result.mp_order_id,
      'created_at', result.created_at,
      'updated_at', result.updated_at,
      'manufacturing_status', result.manufacturing_status,
      'manufacturing_updated_at', result.manufacturing_updated_at,
      'internal_notes', result.internal_notes,
      'checkout_order_customers', case when result.customer_order_id is null then null else jsonb_build_object(
        'full_name', result.customer_full_name,
        'email', result.customer_email,
        'phone', result.customer_phone,
        'delivery_method', result.customer_delivery_method,
        'address_line', result.customer_address_line,
        'city', result.customer_city,
        'province', result.customer_province,
        'postal_code', result.customer_postal_code,
        'delivery_notes', result.customer_delivery_notes,
        'retention_until', result.customer_retention_until
      ) end,
      'checkout_email_outbox', coalesce((
        select jsonb_agg(jsonb_build_object(
          'notification_type', email.notification_type,
          'status', email.status,
          'attempt_count', email.attempt_count,
          'sent_at', email.sent_at,
          'last_error', email.last_error
        ) order by email.created_at)
        from public.checkout_email_outbox email
        where email.order_id = result.id
      ), '[]'::jsonb)
    ) as order_data,
    result.filtered_count as total_count
  from counted result
  order by
    case when p_sort = 'asc' then result.created_at end asc,
    case when p_sort <> 'asc' or p_sort is null then result.created_at end desc,
    result.id
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.checkout_admin_list_orders(text,text,text,text,timestamptz,timestamptz,text,integer,integer)
  from public, anon;
grant execute on function public.checkout_admin_list_orders(text,text,text,text,timestamptz,timestamptz,text,integer,integer)
  to authenticated;

comment on function public.checkout_admin_list_orders(text,text,text,text,timestamptz,timestamptz,text,integer,integer) is
  'Lista paginada de pedidos. Se ejecuta con RLS del usuario y exige autorización administrativa.';
