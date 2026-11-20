create table private.access_links (
  token uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups on delete cascade,
  label text not null,
  purpose text not null check (purpose in ('join','restore','backup')),
  target uuid references public.members on delete cascade,
  unique (target),
  check ((purpose = 'join') = (target is null))
);
revoke all on private.access_links from public, anon, authenticated;

-- Changing the role, identity or status invalidates any previous recovery credential.
create function private.clear_member_link() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from private.access_links where target = old.id;
  return new;
end $$;
create trigger clear_member_link after update of user_id, role, left_on on public.members
for each row when ((new.user_id,new.role,new.left_on) is distinct from (old.user_id,old.role,old.left_on))
execute function private.clear_member_link();

create function public.issue_access_link(p_group uuid, p_label text, p_target uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare m public.members; kind text := 'join'; result uuid;
begin
  if not private.is_admin(p_group) then raise exception 'শুধু অ্যাডমিন লিংক তৈরি করতে পারবেন।'; end if;
  if p_target is not null then
    select * into m from public.members where id=p_target and group_id=p_group and left_on is null for update;
    if not found then raise exception 'সদস্য সক্রিয় নন।'; end if;
    if m.role='admin' and m.user_id is distinct from auth.uid() then raise exception 'নিজের রিকভারি কোড ব্যবহার করুন।'; end if;
    kind := case when m.role='admin' then 'backup' else 'restore' end;
    p_label := m.display_name;
    delete from private.access_links where target=m.id;
  end if;
  if coalesce(length(trim(p_label)),0) not between 1 and 100 then raise exception 'সদস্যের নাম লিখুন (সর্বোচ্চ ১০০ অক্ষর)।'; end if;
  insert into private.access_links(group_id,label,purpose,target) values(p_group,trim(p_label),kind,p_target) returning token into result;
  return result;
end $$;

create function public.pending_access_links(p_group uuid) returns table(token uuid,label text,purpose text)
language sql stable security definer set search_path = '' as $$
 select l.token,l.label,l.purpose from private.access_links l where l.group_id=p_group and private.is_admin(p_group)
 and (l.purpose <> 'backup' or l.target=private.my_member(p_group)) order by l.label
$$;

create function public.cancel_access_link(p_group uuid,p_token uuid) returns void
language sql security definer set search_path = '' as $$
 delete from private.access_links where group_id=p_group and token=p_token and private.is_admin(p_group)
 and (purpose <> 'backup' or target=private.my_member(p_group))
$$;

create function public.preview_access_link(p_token uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
 select jsonb_build_object('group_name',g.name,'label',l.label,'purpose',l.purpose)
 from private.access_links l join public.groups g on g.id=l.group_id where l.token=p_token
$$;

create function public.accept_access_link(p_token uuid,p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare l private.access_links; internal_code text;
begin
  if auth.uid() is null then raise exception 'সেশন শুরু করুন।'; end if;
  delete from private.access_links where token=p_token returning * into l;
  if not found then raise exception 'লিংকটি ব্যবহৃত বা বাতিল হয়েছে।'; end if;
  if private.my_member(l.group_id) is not null then raise exception 'এই ডিভাইসে খাতাটি ইতিমধ্যে খোলা আছে।'; end if;
  if l.purpose='join' then
    if coalesce(length(trim(p_name)),0) not between 1 and 100 then raise exception 'সদস্যের নাম লিখুন।'; end if;
    select invite_code into internal_code from public.groups where id=l.group_id;
    perform private.join_group(internal_code,p_name);
  else
    update public.members set user_id=auth.uid() where id=l.target and group_id=l.group_id and left_on is null
      and role=case when l.purpose='backup' then 'admin' else 'member' end;
    if not found then raise exception 'সদস্যের অনুমতি বদলেছে। নতুন লিংক নিন।'; end if;
  end if;
  return l.group_id;
end $$;
revoke all on function private.clear_member_link() from public, anon, authenticated;
revoke all on function public.issue_access_link(uuid,text,uuid), public.pending_access_links(uuid),
 public.cancel_access_link(uuid,uuid), public.accept_access_link(uuid,text), public.preview_access_link(uuid)
 from public, anon, authenticated;
grant execute on function public.issue_access_link(uuid,text,uuid), public.pending_access_links(uuid),
 public.cancel_access_link(uuid,uuid), public.accept_access_link(uuid,text), public.preview_access_link(uuid) to authenticated;
grant execute on function public.preview_access_link(uuid) to anon;

create function private.provision_admin_backup() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into private.access_links(group_id,label,purpose,target)
    values (new.group_id,new.display_name,'backup',new.id) on conflict(target) do nothing;
  return new;
end $$;
-- AFTER triggers of the same kind run alphabetically, after clear_member_link.
create trigger provision_admin_backup after insert or update of role,user_id,left_on on public.members
for each row when (new.role='admin' and new.user_id is not null and new.left_on is null)
execute function private.provision_admin_backup();
revoke all on function private.provision_admin_backup() from public, anon, authenticated;
insert into private.access_links(group_id,label,purpose,target)
 select group_id,display_name,'backup',id from public.members where role='admin' and user_id is not null and left_on is null;
