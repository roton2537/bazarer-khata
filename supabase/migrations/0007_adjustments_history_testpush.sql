-- 0007: সমন্বয় ভুক্তি, বাজারের পরিবর্তনের ইতিহাস, পরীক্ষামূলক পুশ

-- ── ১. সমন্বয় (চূড়ান্ত মাসের ভুল পরের মাসে শুধরানো) ─────────────
-- অ্যাডমিন চলতি মাসে "X-এর কাছ থেকে Y-কে A টাকা" ধরনের নিশ্চিত ভুক্তি দিতে পারেন।
-- হিসাবে এটি X-এর পরিশোধ ও Y-এর প্রাপ্তির মতো কাজ করে; চূড়ান্ত মাস অপরিবর্তিত থাকে।
alter table public.payments add column kind text not null default 'payment' check (kind in ('payment','adjustment'));

create function public.add_adjustment(p_group uuid, p_token uuid, p_from uuid, p_to uuid, p_amount bigint, p_reason text) returns uuid
language plpgsql security definer set search_path = public, private as $$
declare me uuid := private.my_member(p_group); existing uuid; pid uuid; m date := private.month_start(private.today()); why text := btrim(coalesce(p_reason, ''));
begin
  if not private.is_admin(p_group) then raise exception 'শুধু অ্যাডমিন সমন্বয় করতে পারবেন।'; end if;
  select id into existing from payments where group_id = p_group and client_token = p_token;
  if existing is not null then return existing; end if;
  if p_amount is null or p_amount <= 0 or p_amount >= 100000000000 then raise exception 'সমন্বয়ের টাকা শূন্যের বেশি হতে হবে।'; end if;
  if char_length(why) not between 1 and 200 then raise exception 'সমন্বয়ের কারণ লিখুন (সর্বোচ্চ ২০০ অক্ষর)।'; end if;
  if p_from = p_to or not exists (select 1 from members where id = p_from and group_id = p_group)
     or not exists (select 1 from members where id = p_to and group_id = p_group) then
    raise exception 'সদস্য ঠিক নয়।';
  end if;
  if private.is_final(p_group, m) then raise exception 'এই মাসের হিসাব চূড়ান্ত হয়ে গেছে।'; end if;
  begin
    insert into payments(group_id, month, from_id, to_id, amount, status, note, client_token, resolved_at, kind)
    values (p_group, m, p_from, p_to, p_amount, 'confirmed', 'সমন্বয়: ' || why, p_token, now(), 'adjustment') returning id into pid;
  exception when unique_violation then
    select id into existing from payments where group_id = p_group and client_token = p_token;
    if existing is null then raise; end if;
    return existing;
  end;
  perform private.log(p_group, me, 'adjustment',
    private.mname(me) || ' সমন্বয় করেছেন: ' || private.mname(p_from) || ' → ' || private.mname(p_to) || ' ' ||
    private.money(p_group, p_amount) || ' (' || why || ')।');
  return pid;
end $$;
revoke all on function public.add_adjustment(uuid,uuid,uuid,uuid,bigint,text) from public, anon;
grant execute on function public.add_adjustment(uuid,uuid,uuid,uuid,bigint,text) to authenticated;

-- ── ২. বাজারের ইতিহাস ───────────────────────────────────────────
create table public.purchase_history (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  action text not null check (action in ('created','edited','deleted')),
  changed_by uuid references public.members(id) on delete set null,
  changed_at timestamptz not null default now(),
  snapshot jsonb not null   -- created: নতুন মান; edited/deleted: বদলের আগের মান
);
create index purchase_history_idx on public.purchase_history(purchase_id, changed_at);
alter table public.purchase_history enable row level security;
create policy history_read on public.purchase_history for select using (private.can_view_purchase(purchase_id));
revoke all on public.purchase_history from anon, authenticated;
grant select on public.purchase_history to authenticated;

create function private.snap(p public.purchases) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('date', p.bazar_date, 'buyer', p.buyer_id, 'buyer_name', (select display_name from members where id = p.buyer_id),
                            'description', p.description, 'amount', p.amount)
$$;
create function private.track_purchase() returns trigger language plpgsql security definer set search_path = public, private as $$
begin
  if tg_op = 'INSERT' then
    insert into purchase_history(purchase_id, group_id, action, changed_by, snapshot) values (new.id, new.group_id, 'created', new.created_by, private.snap(new));
  elsif old.deleted_at is null and new.deleted_at is not null then
    insert into purchase_history(purchase_id, group_id, action, changed_by, snapshot) values (new.id, new.group_id, 'deleted', private.my_member_any(new.group_id), private.snap(old));
  elsif (old.bazar_date, old.buyer_id, old.description, old.amount) is distinct from (new.bazar_date, new.buyer_id, new.description, new.amount) then
    insert into purchase_history(purchase_id, group_id, action, changed_by, snapshot) values (new.id, new.group_id, 'edited', private.my_member_any(new.group_id), private.snap(old));
  end if;
  return null;
end $$;
create trigger purchases_track after insert or update on public.purchases for each row execute function private.track_purchase();

-- ── ৩. পরীক্ষামূলক পুশ ─────────────────────────────────────────
-- "push_test" ঘটনা শুধু নোটিফিকেশন-ফাংশন দেখে (ফিডে আসে না) এবং শুধু প্রেরককে পাঠায়।
drop policy events_read on public.events;
create policy events_read on public.events for select
  using (created_at < private.horizon(group_id)::timestamptz and kind <> 'push_test');

create function public.send_test_push(p_group uuid) returns void
language plpgsql security definer set search_path = public, private as $$
declare me uuid := private.my_member(p_group);
begin
  if me is null then raise exception 'আপনি এই গ্রুপের সক্রিয় সদস্য নন।'; end if;
  if exists (select 1 from events where group_id = p_group and actor_id = me and kind = 'push_test' and created_at > now() - interval '1 minute') then
    raise exception 'একটু পরে আবার চেষ্টা করুন।';
  end if;
  perform private.log(p_group, me, 'push_test', 'পরীক্ষামূলক নোটিফিকেশন: সব ঠিক আছে ✓');
end $$;
revoke all on function public.send_test_push(uuid) from public, anon;
grant execute on function public.send_test_push(uuid) to authenticated;
