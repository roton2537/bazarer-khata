-- 0005: অডিটে পাওয়া সমস্যার সমাধান
--  ১) সাবেক সদস্য শুধু নিজের সদস্য-থাকা শেষ মাস পর্যন্ত হিসাব দেখতে পান
--  ২) অ্যাডমিন সদস্যকে সরাতে পারেন (remove_member)
--  ৩) আমন্ত্রণ ও অ্যাক্সেস-লিংকের মেয়াদ (join ৭ দিন, restore ৩ দিন, আমন্ত্রণ ১৪ দিন; অ্যাডমিন ব্যাকআপ কোড স্থায়ী)
--  ৪) ফোন/পরিচয় বদলালে সবার ফিডে ঘটনা
--  ৫) একই টোকেনের সমান্তরাল অনুরোধে কাঁচা ত্রুটির বদলে আগের ফল
--  ৬) এক বাজারে সর্বোচ্চ ১০০ আইটেম
--  ৭) অ্যাকাউন্ট-মোছা সদস্যকে পেমেন্ট লেখা বন্ধ

-- ── ১. দেখার সীমা ───────────────────────────────────────────────
create function private.horizon(g uuid) returns date language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from members where group_id = g and user_id = auth.uid() and left_on is null) then 'infinity'::date
    else coalesce((select (date_trunc('month', max(left_on) - 1) + interval '1 month')::date
                   from members where group_id = g and user_id = auth.uid()), '-infinity'::date) end
$$;
create function private.can_view_month(g uuid, m date) returns boolean language sql stable security definer set search_path = public as
$$ select m < private.horizon(g) $$;
create function private.can_view_purchase(pid uuid) returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from purchases p where p.id = pid and private.can_view_month(p.group_id, p.month)) $$;
grant execute on function private.horizon(uuid), private.can_view_month(uuid,date), private.can_view_purchase(uuid) to authenticated;

drop policy purchases_read on public.purchases;
drop policy items_read on public.purchase_items;
drop policy shares_read on public.purchase_shares;
drop policy payments_read on public.payments;
drop policy months_read on public.months;
drop policy corrections_read on public.corrections;
drop policy events_read on public.events;
create policy purchases_read on public.purchases for select using (private.can_view_month(group_id, month));
create policy items_read on public.purchase_items for select using (private.can_view_purchase(purchase_id));
create policy shares_read on public.purchase_shares for select using (private.can_view_purchase(purchase_id));
create policy payments_read on public.payments for select using (private.can_view_month(group_id, month));
create policy months_read on public.months for select using (private.can_view_month(group_id, month));
create policy corrections_read on public.corrections for select using (private.can_view_month(group_id, month));
create policy events_read on public.events for select using (created_at < private.horizon(group_id)::timestamptz);

create or replace function public.month_report(p_group uuid, p_month date) returns jsonb
language plpgsql security definer set search_path = public, private as $$
declare m date := private.month_start(p_month); fin months;
begin
  if private.my_member_any(p_group) is null then raise exception 'এই গ্রুপে আপনার অনুমতি নেই।'; end if;
  if not private.can_view_month(p_group, m) then raise exception 'আপনি এই মাসে গ্রুপের সদস্য ছিলেন না।'; end if;
  select * into fin from months where group_id = p_group and month = m;
  if found then
    return fin.report || jsonb_build_object('status', 'finalized', 'finalized_at', fin.finalized_at,
                                            'finalized_by_name', private.mname(fin.finalized_by));
  end if;
  return private.compute_report(p_group, m) || jsonb_build_object('status', 'open');
end $$;

create or replace function public.group_months(p_group uuid) returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
begin
  if private.my_member_any(p_group) is null then raise exception 'এই গ্রুপে আপনার অনুমতি নেই।'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('month', x.m, 'finalized', exists (select 1 from months t where t.group_id = p_group and t.month = x.m)) order by x.m desc)
    from (select private.month_start(private.today()) as m
          union select month from purchases where group_id = p_group and deleted_at is null
          union select month from payments where group_id = p_group
          union select month from months where group_id = p_group) x
    where private.can_view_month(p_group, x.m)), '[]'::jsonb);
end $$;

create or replace function public.list_corrections(p_group uuid, p_month date) returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
declare m date := private.month_start(p_month);
begin
  if private.my_member_any(p_group) is null then raise exception 'এই গ্রুপে আপনার অনুমতি নেই।'; end if;
  if not private.can_view_month(p_group, m) then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'kind', c.kind, 'status', c.status, 'reason', c.reason, 'created_at', c.created_at,
      'requested_by', c.requested_by, 'requested_by_name', private.mname(c.requested_by), 'resolve_note', c.resolve_note,
      'date', c.bazar_date, 'amount', c.amount, 'description', c.description, 'buyer_name', private.mname(c.buyer_id),
      'old', case when c.purchase_id is null then null else (
         select jsonb_build_object('date', p.bazar_date, 'amount', p.amount, 'description', p.description,
                'buyer_name', private.mname(p.buyer_id),
                'shares', (select coalesce(jsonb_agg(jsonb_build_object('member_id', s.member_id, 'name', private.mname(s.member_id), 'share', s.share)), '[]'::jsonb)
                           from purchase_shares s where s.purchase_id = p.id))
         from purchases p where p.id = c.purchase_id) end,
      'new_shares', case when c.kind = 'delete' then '[]'::jsonb else private.preview_split(c.group_id, c.bazar_date, c.amount) end
    ) order by c.created_at)
    from corrections c where c.group_id = p_group and c.month = m), '[]'::jsonb);
end $$;

-- ── ২. সদস্য সরানো ────────────────────────────────────────────────
create function public.remove_member(p_group uuid, p_member uuid) returns void
language plpgsql security definer set search_path = public, private as $$
declare me uuid := private.my_member(p_group); t members;
begin
  if not private.is_admin(p_group) then raise exception 'শুধু অ্যাডমিন সদস্য সরাতে পারবেন।'; end if;
  if p_member = me then raise exception 'নিজেকে সরানো যায় না। “গ্রুপ ছাড়ুন” ব্যবহার করুন।'; end if;
  select * into t from members where id = p_member and group_id = p_group and left_on is null for update;
  if not found then raise exception 'সদস্য সক্রিয় নন।'; end if;
  if t.role = 'admin' then raise exception 'অ্যাডমিনকে সরানো যায় না। আগে দায়িত্ব বদলান।'; end if;
  perform private.do_leave(p_group, p_member);
  perform private.log(p_group, me, 'member_removed', private.mname(me) || ' ' || t.display_name || '-কে গ্রুপ থেকে সরিয়েছেন।');
end $$;
revoke all on function public.remove_member(uuid,uuid) from public, anon;
grant execute on function public.remove_member(uuid,uuid) to authenticated;

-- ── ৩. মেয়াদ ─────────────────────────────────────────────────────
alter table private.access_links add column created_at timestamptz not null default now();
alter table private.member_invitations add column created_at timestamptz not null default now();

create function private.link_ttl(p text) returns interval language sql immutable as
$$ select case p when 'join' then interval '7 days' when 'restore' then interval '3 days' else null end $$;
create function private.link_live(p text, c timestamptz) returns boolean language sql stable as
$$ select private.link_ttl(p) is null or c + private.link_ttl(p) > now() $$;

create or replace function public.create_member_invitation(p_group uuid, p_email text) returns text
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
    on conflict (group_id,email) do update set code = excluded.code, redeemed = false, created_at = now();
  return token;
end $$;

create or replace function public.group_name_by_code(p_code text) returns text
language sql stable security definer set search_path = '' as $$
  select g.name from private.member_invitations i join public.groups g on g.id = i.group_id
  where i.code = upper(trim(p_code)) and i.created_at + interval '14 days' > now()
$$;

create or replace function public.join_group(p_code text, p_my_name text) returns uuid
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
  if invitation.created_at + interval '14 days' <= now() then raise exception 'আমন্ত্রণের মেয়াদ শেষ। অ্যাডমিনের কাছ থেকে নতুন আমন্ত্রণ নিন।'; end if;
  select invite_code into internal_code from public.groups where id = invitation.group_id;
  perform private.join_group(internal_code, p_my_name);
  update private.member_invitations set redeemed = true where code = invitation.code;
  return invitation.group_id;
end $$;

drop function public.pending_access_links(uuid);
create function public.pending_access_links(p_group uuid) returns table(token uuid,label text,purpose text,expires_at timestamptz)
language sql stable security definer set search_path = '' as $$
 select l.token,l.label,l.purpose,l.created_at + private.link_ttl(l.purpose)
 from private.access_links l where l.group_id=p_group and private.is_admin(p_group)
 and (l.purpose <> 'backup' or l.target=private.my_member(p_group)) order by l.label
$$;
revoke all on function public.pending_access_links(uuid) from public, anon;
grant execute on function public.pending_access_links(uuid) to authenticated;

create or replace function public.preview_access_link(p_token uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
 select jsonb_build_object('group_name',g.name,'label',l.label,'purpose',l.purpose)
 from private.access_links l join public.groups g on g.id=l.group_id
 where l.token=p_token and private.link_live(l.purpose, l.created_at)
$$;

-- ── ৪. ঘটনা লগ + মেয়াদ যাচাই ─────────────────────────────────────
create or replace function public.accept_access_link(p_token uuid,p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare l private.access_links; internal_code text;
begin
  if auth.uid() is null then raise exception 'সেশন শুরু করুন।'; end if;
  delete from private.access_links where token=p_token returning * into l;
  if not found then raise exception 'লিংকটি ব্যবহৃত বা বাতিল হয়েছে।'; end if;
  if not private.link_live(l.purpose, l.created_at) then raise exception 'লিংকের মেয়াদ শেষ। অ্যাডমিনের কাছ থেকে নতুন লিংক নিন।'; end if;
  if private.my_member(l.group_id) is not null then raise exception 'এই ডিভাইসে খাতাটি ইতিমধ্যে খোলা আছে।'; end if;
  if l.purpose='join' then
    if coalesce(length(trim(p_name)),0) not between 1 and 100 then raise exception 'সদস্যের নাম লিখুন।'; end if;
    select invite_code into internal_code from public.groups where id=l.group_id;
    perform private.join_group(internal_code,p_name);
  else
    update public.members set user_id=auth.uid() where id=l.target and group_id=l.group_id and left_on is null
      and role=case when l.purpose='backup' then 'admin' else 'member' end;
    if not found then raise exception 'সদস্যের অনুমতি বদলেছে। নতুন লিংক নিন।'; end if;
    perform private.log(l.group_id, l.target, 'device_changed',
      private.mname(l.target) || '-এর খাতা নতুন ফোনে খোলা হয়েছে (' ||
      case when l.purpose='backup' then 'ব্যাকআপ কোড' else 'অ্যাডমিনের দেওয়া লিংক' end || ' দিয়ে)।');
  end if;
  return l.group_id;
end $$;

-- ── ৫. সমান্তরাল একই-টোকেন অনুরোধ ────────────────────────────────
create or replace function public.add_purchase(p_group uuid, p_token uuid, p_date date, p_buyer uuid, p_desc text,
                                    p_amount bigint, p_items jsonb default '[]') returns uuid
language plpgsql security definer set search_path = public, private as $$
declare me uuid := private.my_member(p_group); existing uuid; pid uuid; pr purchases;
begin
  if me is null then raise exception 'আপনি এই গ্রুপের সক্রিয় সদস্য নন।'; end if;
  select id into existing from purchases where group_id = p_group and client_token = p_token;
  if existing is not null then return existing; end if;
  if private.month_start(p_date) <> private.month_start(private.today()) then
    raise exception 'আগের মাসের বাজার সরাসরি লেখা যাবে না। রিপোর্ট থেকে সংশোধনের অনুরোধ করুন।';
  end if;
  begin
    pid := private.upsert_purchase(p_group, null, p_token, p_date, coalesce(p_buyer, me), p_desc, p_amount, p_items, me);
  exception when unique_violation then
    select id into existing from purchases where group_id = p_group and client_token = p_token;
    if existing is null then raise; end if;
    return existing;
  end;
  select * into pr from purchases where id = pid;
  perform private.log(p_group, me, 'purchase_added',
    private.mname(pr.buyer_id) || ' ' || private.money_gen(p_group, pr.amount) || ' ' || pr.description || ' কিনেছেন।');
  return pid;
end $$;

-- ── ৫+৭. পেমেন্ট ──────────────────────────────────────────────────
create or replace function public.add_payment(p_group uuid, p_token uuid, p_month date, p_to uuid, p_amount bigint, p_note text default null) returns uuid
language plpgsql security definer set search_path = public, private as $$
declare me uuid := private.my_member_any(p_group); existing uuid; pid uuid; m date := private.month_start(p_month);
begin
  if me is null then raise exception 'এই গ্রুপে আপনার অনুমতি নেই।'; end if;
  select id into existing from payments where group_id = p_group and client_token = p_token;
  if existing is not null then return existing; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'পরিশোধের টাকা শূন্যের বেশি হতে হবে।'; end if;
  if not exists (select 1 from members where id = p_to and group_id = p_group) or p_to = me then
    raise exception 'প্রাপক ঠিক নয়।';
  end if;
  if exists (select 1 from members where id = p_to and user_id is null) then
    raise exception 'প্রাপকের অ্যাকাউন্ট আর নেই, তাই নিশ্চিত করার কেউ নেই। অ্যাডমিনকে জানান।';
  end if;
  if private.is_final(p_group, m) then raise exception 'এই মাসের হিসাব চূড়ান্ত হয়ে গেছে।'; end if;
  if m > private.month_start(private.today()) then raise exception 'ভবিষ্যতের মাসে পরিশোধ লেখা যাবে না।'; end if;
  begin
    insert into payments(group_id, month, from_id, to_id, amount, note, client_token)
    values (p_group, m, me, p_to, p_amount, nullif(btrim(p_note), ''), p_token) returning id into pid;
  exception when unique_violation then
    select id into existing from payments where group_id = p_group and client_token = p_token;
    if existing is null then raise; end if;
    return existing;
  end;
  perform private.log(p_group, me, 'payment_added',
    private.mname(me) || ' ' || private.mname(p_to) || '-কে ' || private.money(p_group, p_amount) || ' পরিশোধ করেছেন (নিশ্চিতের অপেক্ষায়)।');
  return pid;
end $$;

-- ── ৬. আইটেম সীমা ─────────────────────────────────────────────────
create function private.limit_items() returns trigger language plpgsql as $$
begin
  if (select count(*) from public.purchase_items where purchase_id = new.purchase_id) >= 100 then
    raise exception 'এক বাজারে সর্বোচ্চ ১০০টি আইটেম দেওয়া যায়।';
  end if;
  return new;
end $$;
create trigger limit_items before insert on public.purchase_items for each row execute function private.limit_items();
