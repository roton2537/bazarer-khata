create table private.legacy_device_requests (
  device_id uuid primary key references auth.users on delete cascade,
  code text not null unique,
  expires_at timestamptz not null,
  member_id uuid references public.members on delete cascade,
  previous_user uuid,
  approved_by uuid references public.members on delete cascade
);
alter table private.legacy_device_requests enable row level security;
revoke all on private.legacy_device_requests from public, anon, authenticated;

create function public.legacy_device_request() returns text
language plpgsql security definer set search_path='' as $$
declare device uuid := auth.uid(); result text;
begin
  if not exists(select 1 from auth.users where id=device and is_anonymous and coalesce(email,'')='') or
    exists(select 1 from public.members where user_id=device) then raise exception 'Use a new member session.'; end if;
  delete from private.legacy_device_requests where expires_at <= now();
  insert into private.legacy_device_requests as r(device_id,code,expires_at)
    values(device,upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)),now()+interval '10 minutes')
    on conflict(device_id) do update set code=r.code returning code into result;
  return result;
end $$;

create function public.approve_legacy_device(p_group uuid,p_member uuid,p_code text) returns void
language plpgsql security definer set search_path='' as $$
declare previous uuid;
begin
  if not private.is_admin(p_group) then raise exception 'Group admin required.'; end if;
  select m.user_id into previous from public.members m join auth.users u on u.id=m.user_id
    where m.id=p_member and m.group_id=p_group and m.role='member' and m.left_on is null
      and u.is_anonymous and coalesce(u.email,'')='';
  if previous is null then raise exception 'Only existing members without login credentials are eligible.'; end if;
  update private.legacy_device_requests set member_id=p_member,previous_user=previous,approved_by=private.my_member(p_group)
    where code=upper(trim(p_code)) and expires_at>now() and member_id is null and device_id<>previous;
  if not found then raise exception 'Invalid, approved or expired device code.'; end if;
end $$;

create function public.legacy_device_status() returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('group_name',g.name,'member_name',m.display_name)
    from private.legacy_device_requests r join public.members m on m.id=r.member_id
    join public.groups g on g.id=m.group_id where r.device_id=auth.uid() and r.expires_at>now()
$$;

create function public.claim_legacy_device() returns uuid
language plpgsql security definer set search_path='' as $$
declare device uuid := auth.uid(); req private.legacy_device_requests; target_group uuid;
begin
  delete from private.legacy_device_requests where device_id=device and expires_at>now() and member_id is not null returning * into req;
  if not found then raise exception 'Request expired or awaiting approval.'; end if;
  perform 1 from auth.users where id in (device,req.previous_user) order by id for update;
  if (select count(*) from auth.users where id in(device,req.previous_user) and is_anonymous and coalesce(email,'')='')<>2
     or exists(select 1 from public.members where user_id=device) then raise exception 'Member login has changed.'; end if;
  update public.members m set user_id=device where m.id=req.member_id and m.user_id=req.previous_user and m.role='member' and m.left_on is null
    and exists(select 1 from public.members a join auth.users u on u.id=a.user_id where a.id=req.approved_by and a.group_id=m.group_id and a.role='admin' and a.left_on is null and nullif(u.email,'') is not null and lower(u.email) not like '%@members.bazarer-khata.invalid')
    returning m.group_id into target_group;
  if not found then raise exception 'Member or admin access has changed.'; end if;
  perform private.log(target_group,req.approved_by,'member_recovered',private.mname(req.member_id)||' · সদস্যের লগইন পুনরুদ্ধার');
  return target_group;
end $$;

revoke all on function public.legacy_device_request(), public.approve_legacy_device(uuid,uuid,text), public.legacy_device_status(), public.claim_legacy_device() from public,anon;
grant execute on function public.legacy_device_request(), public.approve_legacy_device(uuid,uuid,text), public.legacy_device_status(), public.claim_legacy_device() to authenticated;