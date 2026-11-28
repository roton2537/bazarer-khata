-- Restore only registrations whose profile was missing. Preserve explicit opt-outs.
insert into public.profiles(id,name,push_enabled)
select distinct u.id,coalesce(u.raw_user_meta_data->>'name',''),true
from public.push_subscriptions s join auth.users u on u.id=s.user_id
on conflict(id) do nothing;

create or replace function public.save_push_subscription(p_endpoint text,p_p256dh text,p_auth text)
returns void language plpgsql security definer set search_path='' as $$
declare account uuid := auth.uid();
begin
  if account is null then raise exception 'Sign in required'; end if;
  insert into public.profiles(id,name,push_enabled)
  select id,coalesce(raw_user_meta_data->>'name',''),true from auth.users where id=account
  on conflict(id) do update set push_enabled=true;
  insert into public.push_subscriptions(user_id,endpoint,p256dh,auth) values(account,p_endpoint,p_p256dh,p_auth)
  on conflict(endpoint) do update set user_id=excluded.user_id,p256dh=excluded.p256dh,auth=excluded.auth;
end $$;

create function public.device_push_enabled(p_endpoint text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select from public.push_subscriptions s join public.profiles p on p.id=s.user_id
    where s.user_id=auth.uid() and s.endpoint=p_endpoint and p.push_enabled)
$$;
revoke all on function public.device_push_enabled(text) from public,anon;
grant execute on function public.device_push_enabled(text) to authenticated;
