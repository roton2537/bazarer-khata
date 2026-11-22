-- 0008: Non-destructive production hardening after the KHAI KHAI audit.
-- All active ledgers, purchases, settlements and monthly snapshots are retained.
-- SECURITY: the private schema and public schema cannot be created in by anon/authenticated.
-- Fix role-mutable function lookup paths without changing function bodies or grants.
do $guard$
declare fn record;
begin
  for fn in
    select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='private' and p.proconfig is null
  loop
    execute format('alter function %I.%I(%s) set search_path = pg_catalog, public, private, pg_temp',
      fn.nspname, fn.proname, fn.args);
  end loop;
end $guard$;

-- Auth function is computed once per statement, not for every profile row.
drop policy if exists profiles_self on public.profiles;
create policy profiles_self on public.profiles for select to authenticated
  using (id = (select auth.uid()));

-- Cover foreign keys that are used for group reports, history, payments and access lifecycle.
create index if not exists idx_access_links_group on private.access_links(group_id);
create index if not exists idx_corrections_buyer on public.corrections(buyer_id);
create index if not exists idx_corrections_purchase on public.corrections(purchase_id);
create index if not exists idx_corrections_requester on public.corrections(requested_by);
create index if not exists idx_corrections_resolver on public.corrections(resolved_by);
create index if not exists idx_events_actor on public.events(actor_id);
create index if not exists idx_months_finalized_by on public.months(finalized_by);
create index if not exists idx_pauses_group on public.pauses(group_id);
create index if not exists idx_pauses_member on public.pauses(member_id);
create index if not exists idx_payments_sender on public.payments(from_id);
create index if not exists idx_payments_receiver on public.payments(to_id);
create index if not exists idx_purchase_history_actor on public.purchase_history(changed_by);
create index if not exists idx_purchase_history_group on public.purchase_history(group_id);
create index if not exists idx_purchase_items_group on public.purchase_items(group_id);
create index if not exists idx_purchase_shares_group on public.purchase_shares(group_id);
create index if not exists idx_purchase_shares_member on public.purchase_shares(member_id);
create index if not exists idx_purchases_buyer on public.purchases(buyer_id);
create index if not exists idx_purchases_creator on public.purchases(created_by);
create index if not exists idx_push_subscriptions_user on public.push_subscriptions(user_id);
-- push_subscriptions intentionally has no client policies: service-role Edge Function access only.
-- Public invitation/preview RPCs remain callable with unguessable tokens; inspect inputs server-side.
