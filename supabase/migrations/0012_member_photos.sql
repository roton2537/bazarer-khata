alter table public.profiles add column avatar_data text;
alter table public.profiles add constraint avatar_data_size check (avatar_data is null or (length(avatar_data)<=60000 and avatar_data ~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+={0,2}$'));
create function public.set_my_photo(p_photo text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  update public.profiles set avatar_data=p_photo where id=auth.uid();
end $$;
create function public.group_photos(p_group uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_object_agg(m.id::text,p.avatar_data),'{}'::jsonb)
  from public.members m join public.profiles p on p.id=m.user_id
  where m.group_id=p_group and p.avatar_data is not null
    and private.my_member_any(p_group) is not null
$$;
revoke all on function public.set_my_photo(text),public.group_photos(uuid) from public,anon;
grant execute on function public.set_my_photo(text),public.group_photos(uuid) to authenticated;
