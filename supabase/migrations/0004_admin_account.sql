-- New ledgers belong to signed-in email accounts. Member invitations still accept anonymous users.
alter function public.create_group(text,text,text,text,text,integer,text) set schema private;
revoke all on function private.create_group(text,text,text,text,text,integer,text) from public,anon,authenticated;

create function public.create_group(p_name text,p_currency_code text,p_symbol text,p_cname text,p_cgen text,p_decimals integer,p_my_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from auth.users where id=auth.uid() and nullif(email,'') is not null) then
    raise exception 'খাতা তৈরি করতে ইমেইল অ্যাকাউন্টে সাইন ইন করুন।';
  end if;
  return private.create_group(p_name,p_currency_code,p_symbol,p_cname,p_cgen,p_decimals,p_my_name);
end $$;
revoke all on function public.create_group(text,text,text,text,text,integer,text) from public,anon;
grant execute on function public.create_group(text,text,text,text,text,integer,text) to authenticated;
