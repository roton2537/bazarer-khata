-- Username accounts use internal Auth aliases and cannot receive an administrator role.
create or replace function private.guard_member_alias_role() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.role='admin' and exists(select 1 from auth.users where id=new.user_id
    and lower(email) like '%@members.bazarer-khata.invalid') then
    raise exception 'অ্যাডমিন হতে নিজের ইমেইল দিয়ে সাইন ইন করুন।';
  end if;
  return new;
end $$;
create trigger member_alias_role before insert or update of role,user_id on public.members
for each row execute function private.guard_member_alias_role();
