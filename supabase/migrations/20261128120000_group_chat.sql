create table public.group_chat_messages (
  seq bigint generated always as identity primary key,
  id uuid not null unique,
  group_id uuid not null references public.groups(id) on delete cascade,
  sender_id uuid not null,
  sender_name text not null,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index group_chat_history on public.group_chat_messages(group_id, seq desc);
alter table public.group_chat_messages enable row level security;
revoke all on public.group_chat_messages from public, anon, authenticated;
grant select on public.group_chat_messages to authenticated, service_role;
create policy chat_group_read on public.group_chat_messages for select to authenticated using
  (exists (select 1 from public.members m where m.group_id = group_chat_messages.group_id and m.user_id = (select auth.uid()) and m.left_on is null));

create function public.send_group_chat(p_group uuid, p_id uuid, p_body text)
returns public.group_chat_messages language plpgsql security definer set search_path = '' as $$
declare sender public.members; message public.group_chat_messages;
begin
  select * into strict sender from public.members where group_id=p_group and user_id=auth.uid() and left_on is null for share;
  insert into public.group_chat_messages(id,group_id,sender_id,sender_name,body)
  values(p_id,p_group,sender.id,sender.display_name,btrim(p_body))
  on conflict(id) do nothing returning * into message;
  if message.id is null then
    select * into strict message from public.group_chat_messages
    where id=p_id and group_id=p_group and sender_id=sender.id and body=btrim(p_body);
  end if;
  return message;
end $$;
revoke all on function public.send_group_chat(uuid,uuid,text) from public, anon;
grant execute on function public.send_group_chat(uuid,uuid,text) to authenticated;
alter publication supabase_realtime add table public.group_chat_messages;

create table public.group_chat_mutes (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  primary key(group_id,user_id)
);
alter table public.group_chat_mutes enable row level security;
revoke all on public.group_chat_mutes from public, anon, authenticated;
grant select, insert, delete on public.group_chat_mutes to authenticated;
grant select on public.group_chat_mutes to service_role;
create policy own_chat_mute on public.group_chat_mutes to authenticated using(user_id=(select auth.uid()))
with check(user_id=(select auth.uid()) and exists(select 1 from public.members m where m.group_id=group_chat_mutes.group_id and m.user_id=(select auth.uid()) and m.left_on is null));

create trigger messmate_chat_push after insert on public.group_chat_messages for each row
execute function public.dispatch_push_event('https://arhublkcafbotpcyaphg.supabase.co/functions/v1/notify?source=chat');
