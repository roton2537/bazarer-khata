-- A batch saves individual purchases atomically using stable per-row tokens.
create function public.add_products(p_group uuid,p_date date,p_rows jsonb) returns uuid[]
language plpgsql security definer set search_path='' as $$
declare row jsonb; ids uuid[] := '{}'; buyer uuid := private.my_member(p_group);
begin
  if buyer is null then raise exception 'সক্রিয় সদস্য প্রয়োজন।'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'পণ্যের তালিকা ঠিক নয়।'; end if;
  if jsonb_array_length(p_rows) not between 1 and 100 then raise exception '১–১০০টি পণ্য লিখুন।'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_group::text,0));
  for row in select value from jsonb_array_elements(p_rows) loop
    ids := array_append(ids,public.add_purchase(p_group,(row->>'token')::uuid,p_date,buyer,row->>'name',(row->>'amount')::bigint,'[]'::jsonb));
  end loop;
  return ids;
end $$;
revoke all on function public.add_products(uuid,date,jsonb) from public,anon;
grant execute on function public.add_products(uuid,date,jsonb) to authenticated;
