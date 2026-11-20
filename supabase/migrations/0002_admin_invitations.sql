-- Legacy group codes are internal after this migration.
create table private.member_invitations (
  group_id uuid not null references public.groups on delete cascade,
  email text not null,
  code text not null unique,
  redeemed boolean not null default false,
  primary key (group_id, email)
);
revoke all on private.member_invitations from public, anon, authenticated;
drop function public.regenerate_invite(uuid);

create function public.create_member_invitation(p_group uuid, p_email text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  recipient text := lower(trim(p_email));
  token text := upper(replace(gen_random_uuid()::text, '-', ''));
begin
  if not private.is_admin(p_group) then raise exception 'শুধু অ্যাডমিন আমন্ত্রণ পাঠাতে পারবেন।'; end if;
  if recipient is null or recipient !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception 'সদস্যের ইমেইল ঠিকানা লিখুন।';
  end if;
  insert into private.member_invitations(group_id,email,code) values (p_group,recipient,token)
    on conflict (group_id,email) do update set code = excluded.code, redeemed = false;
  return token;
end $$;
revoke all on function public.create_member_invitation(uuid,text) from public, anon;
grant execute on function public.create_member_invitation(uuid,text) to authenticated;

create or replace function public.group_name_by_code(p_code text) returns text
language sql stable security definer set search_path = '' as $$
  select g.name from private.member_invitations i join public.groups g on g.id = i.group_id
  where i.code = upper(trim(p_code))
$$;

-- Keep membership creation and ledger updates in the existing transaction.
alter function public.join_group(text,text) set schema private;
revoke all on function private.join_group(text,text) from public, anon, authenticated;
create function public.join_group(p_code text, p_my_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  invitation private.member_invitations%rowtype;
  internal_code text;
begin
  select i.* into invitation from private.member_invitations i
    join auth.users u on u.id = auth.uid() and lower(u.email) = i.email
    where i.code = upper(trim(p_code)) for update of i;
  if not found then raise exception 'আমন্ত্রণের কোডটি ঠিক নয় অথবা এটি অন্য ইমেইলের জন্য।'; end if;
  if invitation.redeemed then
    if private.my_member(invitation.group_id) is not null then return invitation.group_id; end if;
    raise exception 'আবার যোগ দিতে অ্যাডমিনের কাছ থেকে নতুন আমন্ত্রণ নিন।';
  end if;
  select invite_code into internal_code from public.groups where id = invitation.group_id;
  perform private.join_group(internal_code, p_my_name);
  update private.member_invitations set redeemed = true where code = invitation.code;
  return invitation.group_id;
end $$;
revoke all on function public.join_group(text,text) from public, anon;
grant execute on function public.join_group(text,text) to authenticated;
