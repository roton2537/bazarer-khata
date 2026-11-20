-- বাজারের খাতা — ডেটাবেস স্কিমা
-- সব টাকা মুদ্রার ক্ষুদ্রতম এককে (bigint) রাখা হয়। যেমন ৳ ১২.৫০ = 1250 (পয়সা)।
-- ক্লায়েন্ট শুধু SELECT করতে পারে (RLS); সব পরিবর্তন SECURITY DEFINER ফাংশনের (RPC) মাধ্যমে।

create schema if not exists private;

-- ───────────────────────── টেবিল ─────────────────────────

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  push_enabled boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  currency_code text not null default 'BDT',
  currency_symbol text not null default '৳',
  currency_name text not null default 'টাকা',
  currency_gen text not null default 'টাকার',
  currency_decimals smallint not null default 2 check (currency_decimals between 0 and 3),
  invite_code text not null unique,
  created_at timestamptz not null default now()
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  display_name text not null,
  role text not null default 'member' check (role in ('admin','member')),
  joined_on date not null,
  left_on date,                      -- এই তারিখ থেকে আর সক্রিয় নন (প্রথম নিষ্ক্রিয় দিন)
  seq bigint generated always as identity,
  created_at timestamptz not null default now()
);
create unique index members_one_active_per_user on public.members(group_id, user_id)
  where user_id is not null and left_on is null;
create index members_user_idx on public.members(user_id);
create index members_group_idx on public.members(group_id);

create table public.pauses (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  start_date date not null,          -- বিরতির প্রথম দিন (ভাগ বন্ধ)
  end_date date,                     -- ফেরার দিন (ভাগ আবার শুরু); null = এখনও ফেরেননি
  created_at timestamptz not null default now(),
  check (end_date is null or end_date > start_date)
);

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  bazar_date date not null,
  month date generated always as (bazar_date - (extract(day from bazar_date)::int - 1)) stored,
  buyer_id uuid not null references public.members(id),
  description text not null check (char_length(btrim(description)) between 1 and 200),
  amount bigint not null check (amount > 0 and amount < 100000000000),
  created_by uuid not null references public.members(id),
  client_token uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (group_id, client_token)
);
create index purchases_group_month_idx on public.purchases(group_id, month);

create table public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  amount bigint not null check (amount > 0)
);
create index purchase_items_purchase_idx on public.purchase_items(purchase_id);

create table public.purchase_shares (
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  member_id uuid not null references public.members(id),
  share bigint not null check (share >= 0),
  primary key (purchase_id, member_id)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  month date not null,
  from_id uuid not null references public.members(id),
  to_id uuid not null references public.members(id),
  amount bigint not null check (amount > 0 and amount < 100000000000),
  status text not null default 'pending' check (status in ('pending','confirmed','rejected','cancelled','expired')),
  note text,
  client_token uuid not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (from_id <> to_id),
  unique (group_id, client_token)
);
create index payments_group_month_idx on public.payments(group_id, month);

create table public.months (
  group_id uuid not null references public.groups(id) on delete cascade,
  month date not null,
  finalized_at timestamptz not null default now(),
  finalized_by uuid references public.members(id),
  report jsonb not null,
  primary key (group_id, month)
);

create table public.corrections (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  month date not null,
  requested_by uuid not null references public.members(id),
  kind text not null check (kind in ('add','edit','delete')),
  purchase_id uuid references public.purchases(id) on delete set null,
  bazar_date date,
  buyer_id uuid references public.members(id),
  description text,
  amount bigint,
  items jsonb not null default '[]',
  reason text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  resolved_by uuid references public.members(id),
  resolved_at timestamptz,
  resolve_note text,
  client_token uuid not null,
  created_at timestamptz not null default now(),
  unique (group_id, client_token)
);
create index corrections_group_month_idx on public.corrections(group_id, month);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  actor_id uuid references public.members(id) on delete set null,
  kind text not null,
  message text not null,
  created_at timestamptz not null default now()
);
create index events_group_idx on public.events(group_id, created_at desc);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

-- ───────────────────────── সহায়ক ফাংশন (private) ─────────────────────────

create function private.today() returns date language sql stable as
$$ select (now() at time zone 'Asia/Dhaka')::date $$;

create function private.bn(t text) returns text language sql immutable as
$$ select translate(t, '0123456789', '০১২৩৪৫৬৭৮৯') $$;

-- ভারতীয় পদ্ধতিতে কমা (২,০০,০০০)
create function private.bn_group(n bigint) returns text language plpgsql immutable as $$
declare s text := abs(n)::text; res text;
begin
  if length(s) <= 3 then res := s;
  else
    res := right(s, 3); s := left(s, length(s) - 3);
    while length(s) > 2 loop
      res := right(s, 2) || ',' || res; s := left(s, length(s) - 2);
    end loop;
    if length(s) > 0 then res := s || ',' || res; end if;
  end if;
  return case when n < 0 then '-' else '' end || private.bn(res);
end $$;

create function private.num(g uuid, amt bigint) returns text language plpgsql stable as $$
declare d int; p bigint; frac bigint;
begin
  select currency_decimals into d from groups where id = g;
  p := 10 ^ d; frac := abs(amt) % p;
  return private.bn_group(amt / p) ||
    case when frac > 0 then '.' || private.bn(lpad(frac::text, d, '0')) else '' end;
end $$;

create function private.money(g uuid, amt bigint) returns text language sql stable as
$$ select private.num(g, amt) || ' ' || (select currency_name from groups where id = g) $$;

create function private.money_gen(g uuid, amt bigint) returns text language sql stable as
$$ select private.num(g, amt) || ' ' || (select currency_gen from groups where id = g) $$;

create function private.month_label(m date) returns text language sql immutable as $$
  select (array['জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর'])[extract(month from m)::int]
         || ' ' || private.bn(extract(year from m)::int::text) $$;

create function private.date_label(d date) returns text language sql immutable as
$$ select private.bn(extract(day from d)::int::text) || ' ' || private.month_label(d) $$;

create function private.month_start(d date) returns date language sql immutable as
$$ select d - (extract(day from d)::int - 1) $$;

create function private.can_view(g uuid) returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.members where group_id = g and user_id = auth.uid()) $$;

create function private.my_member(g uuid) returns uuid language sql stable security definer set search_path = public as
$$ select id from public.members where group_id = g and user_id = auth.uid() and left_on is null limit 1 $$;

-- পুরোনো সদস্যও (দেনা-পাওনা মেটানোর জন্য) নিজের সদস্য-রেকর্ড পাবেন
create function private.my_member_any(g uuid) returns uuid language sql stable security definer set search_path = public as
$$ select id from public.members where group_id = g and user_id = auth.uid() order by (left_on is null) desc, seq desc limit 1 $$;

create function private.is_admin(g uuid) returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.members where group_id = g and user_id = auth.uid() and left_on is null and role = 'admin') $$;

create function private.is_final(g uuid, m date) returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.groups where id = g) and exists (select 1 from public.months where group_id = g and month = m) $$;

create function private.log(g uuid, actor uuid, k text, msg text) returns void language sql security definer set search_path = public as
$$ insert into public.events(group_id, actor_id, kind, message) values (g, actor, k, msg) $$;

create function private.mname(m uuid) returns text language sql stable security definer set search_path = public as
$$ select display_name from public.members where id = m $$;

-- নির্দিষ্ট দিনে কারা খাওয়ায় সক্রিয়
create function private.active_on(g uuid, d date) returns table(id uuid, seq bigint)
language sql stable security definer set search_path = public as $$
  select m.id, m.seq from public.members m
  where m.group_id = g and m.joined_on <= d and (m.left_on is null or d < m.left_on)
    and not exists (select 1 from public.pauses p
                    where p.member_id = m.id and p.start_date <= d and (p.end_date is null or d < p.end_date))
  order by m.seq
$$;

-- সমান ভাগ। ভাগশেষ (১ পয়সা করে) তারিখ-ভিত্তিক ঘূর্ণনে বণ্টিত হয়; যোগফল সবসময় মোটের সমান।
create function private.split(amount bigint, d date, ids uuid[]) returns table(member_id uuid, share bigint)
language plpgsql immutable as $$
declare n int := array_length(ids, 1); base bigint; rem bigint; off int; i int;
begin
  base := amount / n; rem := amount % n; off := ((d - date '2000-01-01') % n);
  for i in 1..n loop
    member_id := ids[i];
    share := base + case when ((i - 1) - off + n) % n < rem then 1 else 0 end;
    return next;
  end loop;
end $$;

create function private.recompute_purchase(pid uuid) returns void language plpgsql security definer set search_path = public, private as $$
declare p public.purchases; ids uuid[];
begin
  select * into p from public.purchases where id = pid;
  if not found then return; end if;
  select array_agg(a.id order by a.seq) into ids from private.active_on(p.group_id, p.bazar_date) a;
  if ids is null then ids := array[p.buyer_id]; end if;   -- কেউ সক্রিয় না থাকলে ক্রেতাই পুরোটা বহন করেন
  delete from public.purchase_shares where purchase_id = pid;
  insert into public.purchase_shares(purchase_id, group_id, member_id, share)
    select pid, p.group_id, s.member_id, s.share from private.split(p.amount, p.bazar_date, ids) s;
end $$;

-- সদস্যপদ/বিরতি বদলালে খোলা মাসের বাজারের ভাগ নতুন করে হিসাব (চূড়ান্ত মাস অপরিবর্তিত)
create function private.recompute_from(g uuid, from_date date) returns void language plpgsql security definer set search_path = public, private as $$
declare r record;
begin
  for r in select id from public.purchases
           where group_id = g and bazar_date >= from_date and deleted_at is null and not private.is_final(g, month)
  loop
    perform private.recompute_purchase(r.id);
  end loop;
end $$;

create function private.preview_split(g uuid, d date, amount bigint) returns jsonb language plpgsql stable security definer set search_path = public, private as $$
declare ids uuid[];
begin
  select array_agg(a.id order by a.seq) into ids from private.active_on(g, d) a;
  if ids is null then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('member_id', s.member_id, 'name', private.mname(s.member_id), 'share', s.share))
                   from private.split(amount, d, ids) s), '[]'::jsonb);
end $$;

-- বাজার তৈরি/সংশোধন (সব নিয়ম-যাচাইয়ের পর)
create function private.upsert_purchase(g uuid, pid uuid, token uuid, d date, buyer uuid, descr text,
                                       amt bigint, items jsonb, created_by uuid) returns uuid
language plpgsql security definer set search_path = public, private as $$
declare it jsonb; total bigint := 0; nm text; ia bigint; out_id uuid;
begin
  if d is null then raise exception 'বাজারের তারিখ দিন।'; end if;
  if d > private.today() then raise exception 'ভবিষ্যতের তারিখে বাজার লেখা যাবে না।'; end if;
  if not exists (select 1 from members where id = buyer and group_id = g) then
    raise exception 'ক্রেতা এই গ্রুপের সদস্য নন।';
  end if;
  if private.is_final(g, private.month_start(d)) then raise exception 'এই মাসের হিসাব চূড়ান্ত হয়ে গেছে, বদলানো যাবে না।'; end if;

  items := coalesce(items, '[]'::jsonb);
  if jsonb_typeof(items) <> 'array' then raise exception 'আইটেমের তালিকা ঠিক নয়।'; end if;
  if jsonb_array_length(items) > 0 then
    for it in select * from jsonb_array_elements(items) loop
      nm := btrim(coalesce(it->>'name', '')); ia := (it->>'amount')::bigint;
      if nm = '' or ia is null or ia <= 0 then raise exception 'আইটেমের নাম ও টাকা ঠিকমতো দিন।'; end if;
      total := total + ia;
    end loop;
    amt := total;
  end if;
  if amt is null or amt <= 0 then raise exception 'খরচের টাকা শূন্যের বেশি হতে হবে।'; end if;
  descr := btrim(coalesce(descr, ''));
  if descr = '' and jsonb_array_length(items) > 0 then
    descr := left((select string_agg(e->>'name', ', ') from jsonb_array_elements(items) e), 200);
  end if;
  if descr = '' then raise exception 'কী কিনেছেন লিখুন।'; end if;

  if pid is null then
    insert into purchases(group_id, bazar_date, buyer_id, description, amount, created_by, client_token)
    values (g, d, buyer, descr, amt, created_by, token) returning id into out_id;
  else
    update purchases set bazar_date = d, buyer_id = buyer, description = descr, amount = amt, updated_at = now()
    where id = pid and group_id = g and deleted_at is null returning id into out_id;
    if out_id is null then raise exception 'বাজারটি পাওয়া যায়নি।'; end if;
    delete from purchase_items where purchase_id = pid;
  end if;
  for it in select * from jsonb_array_elements(items) loop
    insert into purchase_items(purchase_id, group_id, name, amount)
    values (out_id, g, btrim(it->>'name'), (it->>'amount')::bigint);
  end loop;
  perform private.recompute_purchase(out_id);
  return out_id;
end $$;

-- ───────────────────────── চূড়ান্ত মাস সুরক্ষা (ট্রিগার) ─────────────────────────

create function private.guard_purchase() returns trigger language plpgsql as $$
begin
  if tg_op in ('UPDATE','DELETE') and private.is_final(old.group_id, old.month) then
    raise exception 'চূড়ান্ত হিসাব বদলানো যাবে না।';
  end if;
  if tg_op in ('INSERT','UPDATE') and private.is_final(new.group_id, new.month) then
    raise exception 'চূড়ান্ত হিসাব বদলানো যাবে না।';
  end if;
  return coalesce(new, old);
end $$;
create trigger purchases_guard before insert or update or delete on public.purchases
  for each row execute function private.guard_purchase();

create function private.guard_purchase_child() returns trigger language plpgsql as $$
declare m date; g uuid := coalesce(new.group_id, old.group_id); pid uuid := coalesce(new.purchase_id, old.purchase_id);
begin
  select month into m from public.purchases where id = pid;
  if m is not null and private.is_final(g, m) then raise exception 'চূড়ান্ত হিসাব বদলানো যাবে না।'; end if;
  return coalesce(new, old);
end $$;
create trigger items_guard before insert or update or delete on public.purchase_items
  for each row execute function private.guard_purchase_child();
create trigger shares_guard before insert or update or delete on public.purchase_shares
  for each row execute function private.guard_purchase_child();

create function private.guard_payment() returns trigger language plpgsql as $$
begin
  if tg_op in ('UPDATE','DELETE') and private.is_final(old.group_id, old.month) then
    raise exception 'চূড়ান্ত হিসাব বদলানো যাবে না।';
  end if;
  if tg_op in ('INSERT','UPDATE') and private.is_final(new.group_id, new.month) then
    raise exception 'চূড়ান্ত হিসাব বদলানো যাবে না।';
  end if;
  return coalesce(new, old);
end $$;
create trigger payments_guard before insert or update or delete on public.payments
  for each row execute function private.guard_payment();

create function private.guard_months() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then raise exception 'চূড়ান্ত রিপোর্ট বদলানো যাবে না।'; end if;
  if tg_op = 'DELETE' and exists (select 1 from public.groups where id = old.group_id) then
    raise exception 'চূড়ান্ত রিপোর্ট মুছে ফেলা যাবে না।';
  end if;
  return coalesce(new, old);
end $$;
create trigger months_guard before update or delete on public.months
  for each row execute function private.guard_months();

-- নতুন ব্যবহারকারীর প্রোফাইল
create function private.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, name)
  values (new.id, coalesce(nullif(btrim(new.raw_user_meta_data->>'name'), ''), split_part(coalesce(new.email, ''), '@', 1)))
  on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- ───────────────────────── রিপোর্ট ─────────────────────────

create function private.compute_report(g uuid, m date) returns jsonb language plpgsql stable security definer set search_path = public, private as $$
declare
  ms date := m; me date := (m + interval '1 month')::date;
  rows jsonb; mem jsonb; pur jsonb; pay jsonb; total bigint;
  d_ids uuid[] := '{}'; d_amt bigint[] := '{}'; c_ids uuid[] := '{}'; c_amt bigint[] := '{}';
  r record; i int := 1; j int := 1; x bigint; sett jsonb := '[]'::jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(t) order by t.seq), '[]'::jsonb) into rows from (
    select mm.id, mm.display_name as name, mm.role, mm.seq,
      (mm.left_on is not null and mm.left_on <= me) as "left",
      a.purchased, a.share, a.sent, a.received, (a.purchased - a.share + a.sent - a.received) as balance
    from members mm
    cross join lateral (select
      coalesce((select sum(p.amount) from purchases p where p.group_id = g and p.month = ms and p.deleted_at is null and p.buyer_id = mm.id), 0)::bigint as purchased,
      coalesce((select sum(s.share) from purchase_shares s join purchases p on p.id = s.purchase_id
                where p.group_id = g and p.month = ms and p.deleted_at is null and s.member_id = mm.id), 0)::bigint as share,
      coalesce((select sum(y.amount) from payments y where y.group_id = g and y.month = ms and y.status = 'confirmed' and y.from_id = mm.id), 0)::bigint as sent,
      coalesce((select sum(y.amount) from payments y where y.group_id = g and y.month = ms and y.status = 'confirmed' and y.to_id = mm.id), 0)::bigint as received) a
    where mm.group_id = g and (
          (mm.joined_on < me and (mm.left_on is null or mm.left_on > ms))
       or a.purchased > 0 or a.share > 0 or a.sent > 0 or a.received > 0)
  ) t;
  mem := rows;
  select coalesce(sum((e->>'purchased')::bigint), 0) into total from jsonb_array_elements(rows) e;

  -- কে কাকে কত দেবেন (বড় দেনাদার ↔ বড় পাওনাদার, নির্ধারিত ক্রমে)
  for r in select (e->>'id')::uuid as id, (e->>'balance')::bigint as bal from jsonb_array_elements(rows) e
           where (e->>'balance')::bigint < 0 order by (e->>'balance')::bigint asc, (e->>'seq')::bigint asc loop
    d_ids := d_ids || r.id; d_amt := d_amt || (-r.bal);
  end loop;
  for r in select (e->>'id')::uuid as id, (e->>'balance')::bigint as bal from jsonb_array_elements(rows) e
           where (e->>'balance')::bigint > 0 order by (e->>'balance')::bigint desc, (e->>'seq')::bigint asc loop
    c_ids := c_ids || r.id; c_amt := c_amt || r.bal;
  end loop;
  while i <= coalesce(array_length(d_ids, 1), 0) and j <= coalesce(array_length(c_ids, 1), 0) loop
    x := least(d_amt[i], c_amt[j]);
    sett := sett || jsonb_build_object('from', d_ids[i], 'from_name', private.mname(d_ids[i]),
                                       'to', c_ids[j], 'to_name', private.mname(c_ids[j]), 'amount', x);
    d_amt[i] := d_amt[i] - x; c_amt[j] := c_amt[j] - x;
    if d_amt[i] = 0 then i := i + 1; end if;
    if c_amt[j] = 0 then j := j + 1; end if;
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'date', p.bazar_date, 'buyer', p.buyer_id,
           'buyer_name', private.mname(p.buyer_id), 'description', p.description, 'amount', p.amount)
           order by p.bazar_date, p.created_at), '[]'::jsonb)
    into pur from purchases p where p.group_id = g and p.month = ms and p.deleted_at is null;

  select coalesce(jsonb_agg(jsonb_build_object('id', y.id, 'from', y.from_id, 'from_name', private.mname(y.from_id),
           'to', y.to_id, 'to_name', private.mname(y.to_id), 'amount', y.amount, 'status', y.status, 'created_at', y.created_at)
           order by y.created_at), '[]'::jsonb)
    into pay from payments y where y.group_id = g and y.month = ms;

  return jsonb_build_object(
    'month', ms, 'total', total, 'members', mem, 'settlements', sett, 'purchases', pur, 'payments', pay,
    'pending_payments', (select count(*) from payments y where y.group_id = g and y.month = ms and y.status = 'pending'),
    'pending_corrections', (select count(*) from corrections c where c.group_id = g and c.month = ms and c.status = 'pending'));
end $$;

-- ───────────────────────── RPC (ক্লায়েন্ট এগুলোই ডাকে) ─────────────────────────

create function public.create_group(p_name text, p_currency_code text, p_symbol text, p_cname text, p_cgen text,
                                    p_decimals int, p_my_name text) returns uuid
language plpgsql security definer set search_path = public, private as $$
declare gid uuid; code text; mid uuid; nm text;
begin
  if auth.uid() is null then raise exception 'আগে সাইন ইন করুন।'; end if;
  if btrim(coalesce(p_name, '')) = '' then raise exception 'গ্রুপের নাম দিন।'; end if;
  nm := coalesce(nullif(btrim(p_my_name), ''), (select name from profiles where id = auth.uid()), 'আমি');
  loop
    code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from groups where invite_code = code);
  end loop;
  insert into groups(name, currency_code, currency_symbol, currency_name, currency_gen, currency_decimals, invite_code)
  values (btrim(p_name), coalesce(p_currency_code, 'BDT'), coalesce(p_symbol, '৳'), coalesce(p_cname, 'টাকা'),
          coalesce(p_cgen, 'টাকার'), coalesce(p_decimals, 2), code) returning id into gid;
  insert into members(group_id, user_id, display_name, role, joined_on)
  values (gid, auth.uid(), nm, 'admin', private.today()) returning id into mid;
  perform private.log(gid, mid, 'group_created', nm || ' গ্রুপ “' || btrim(p_name) || '” তৈরি করেছেন।');
  return gid;
end $$;

create function public.group_name_by_code(p_code text) returns text
language sql stable security definer set search_path = public as
$$ select name from groups where invite_code = upper(btrim(p_code)) $$;

create function public.join_group(p_code text, p_my_name text) returns uuid
language plpgsql security definer set search_path = public, private as $$
declare g uuid; mid uuid; nm text;
begin
  if auth.uid() is null then raise exception 'আগে সাইন ইন করুন।'; end if;
  select id into g from groups where invite_code = upper(btrim(p_code));
  if g is null then raise exception 'আমন্ত্রণের কোডটি ঠিক নয়।'; end if;
  if private.my_member(g) is not null then return g; end if;   -- আগেই সদস্য
  nm := coalesce(nullif(btrim(p_my_name), ''), (select name from profiles where id = auth.uid()), 'নতুন সদস্য');
  insert into members(group_id, user_id, display_name, joined_on)
  values (g, auth.uid(), nm, private.today()) returning id into mid;
  perform private.recompute_from(g, private.today());
  perform private.log(g, mid, 'member_joined', nm || ' গ্রুপে যোগ দিয়েছেন।');
  return g;
end $$;

create function public.regenerate_invite(p_group uuid) returns text
language plpgsql security definer set search_path = public, private as $$
declare code text;
begin
  if not private.is_admin(p_group) then raise exception 'শুধু অ্যাডমিন এটি করতে পারবেন।'; end if;
  loop
    code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from groups where invite_code = code);
  end loop;
  update groups set invite_code = code where id = p_group;
  return code;
end $$;

create function public.preview_split(p_group uuid, p_date date, p_amount bigint) returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
begin
  if private.my_member_any(p_group) is null then raise exception 'এই গ্রুপে আপনার অনুমতি নেই।'; end if;
  if p_amount is null or p_amount <= 0 then return '[]'::jsonb; end if;
  return private.preview_split(p_group, p_date, p_amount);
end $$;

create function public.add_purchase(p_group uuid, p_token uuid, p_date date, p_buyer uuid, p_desc text,
                                    p_amount bigint, p_items jsonb default '[]') returns uuid
language plpgsql security definer set search_path = public, private as $$
declare me uuid := private.my_member(p_group); existing uuid; pid uuid; pr purchases;
begin
  if me is null then raise exception 'আপনি এই গ্রুপের সক্রিয় সদস্য নন।'; end if;
  select id into existing from purchases where group_id = p_group and client_token = p_token;
  if existing is not null then return existing; end if;     -- একই বাটন দুবার চাপলেও একবারই যোগ হবে
  if private.month_start(p_date) <> private.month_start(private.today()) then
    raise exception 'আগের মাসের বাজার সরাসরি লেখা যাবে না। রিপোর্ট থেকে সংশোধনের অনুরোধ করুন।';
  end if;
  pid := private.upsert_purchase(p_group, null, p_token, p_date, coalesce(p_buyer, me), p_desc, p_amount, p_items, me);
  select * into pr from purchases where id = pid;
  perform private.log(p_group, me, 'purchase_added',
    private.mname(pr.buyer_id) || ' ' || private.money_gen(p_group, pr.amount) || ' ' || pr.description || ' কিনেছেন।');
  return pid;
end $$;

create function public.update_purchase(p_id uuid, p_date date, p_buyer uuid, p_desc text, p_amount bigint, p_items jsonb default '[]') returns uuid
language plpgsql security definer set search_path = public, private as $$
declare pr purchases; me uuid; pid uuid;
begin
  select * into pr from purchases where id = p_id and deleted_at is null;
  if not found then raise exception 'বাজারটি পাওয়া যায়নি।'; end if;
  me := private.my_member(pr.group_id);
  if me is null then raise exception 'আপনি এই গ্রুপের সক্রিয় সদস্য নন।'; end if;
  if pr.created_by <> me and not private.is_admin(pr.group_id) then raise exception 'শুধু নিজের লেখা বাজার সংশোধন করা যাবে।'; end if;
  if pr.month <> private.month_start(private.today()) or private.month_start(p_date) <> pr.month then
    raise exception 'আগের মাসের বাজার সরাসরি বদলানো যাবে না। রিপোর্ট থেকে সংশোধনের অনুরোধ করুন।';
  end if;
  pid := private.upsert_purchase(pr.group_id, p_id, null, p_date, p_buyer, p_desc, p_amount, p_items, me);
  select * into pr from purchases where id = pid;
  perform private.log(pr.group_id, me, 'purchase_edited',
    private.mname(me) || ' একটি বাজার সংশোধন করেছেন: ' || pr.description || ', ' || private.money(pr.group_id, pr.amount) || '।');
  return pid;
end $$;

create function public.delete_purchase(p_id uuid) returns void
language plpgsql security definer set search_path = public, private as $$
declare pr purchases; me uuid;
begin
  select * into pr from purchases where id = p_id and deleted_at is null;
  if not found then return; end if;
  me := private.my_member(pr.group_id);
  if me is null then raise exception 'আপনি এই গ্রুপের সক্রিয় সদস্য নন।'; end if;
  if pr.created_by <> me and not private.is_admin(pr.group_id) then raise exception 'শুধু নিজের লেখা বাজার মুছতে পারবেন।'; end if;
  if pr.month <> private.month_start(private.today()) then
    raise exception 'আগের মাসের বাজার সরাসরি মোছা যাবে না। রিপোর্ট থেকে অনুরোধ করুন।';
  end if;
  update purchases set deleted_at = now() where id = p_id;
  delete from purchase_shares where purchase_id = p_id;
  perform private.log(pr.group_id, me, 'purchase_deleted',
    private.mname(me) || ' ' || private.money_gen(pr.group_id, pr.amount) || ' ' || pr.description || ' বাজারটি মুছে ফেলেছেন।');
end $$;

-- পরিশোধ লেখা: দাতা লেখেন, প্রাপক নিশ্চিত করলে তবেই হিসাবে ধরা হয়
create function public.add_payment(p_group uuid, p_token uuid, p_month date, p_to uuid, p_amount bigint, p_note text default null) returns uuid
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
  if private.is_final(p_group, m) then raise exception 'এই মাসের হিসাব চূড়ান্ত হয়ে গেছে।'; end if;
  if m > private.month_start(private.today()) then raise exception 'ভবিষ্যতের মাসে পরিশোধ লেখা যাবে না।'; end if;
  insert into payments(group_id, month, from_id, to_id, amount, note, client_token)
  values (p_group, m, me, p_to, p_amount, nullif(btrim(p_note), ''), p_token) returning id into pid;
  perform private.log(p_group, me, 'payment_added',
    private.mname(me) || ' ' || private.mname(p_to) || '-কে ' || private.money(p_group, p_amount) || ' পরিশোধ করেছেন (নিশ্চিতের অপেক্ষায়)।');
  return pid;
end $$;

-- প্রাপকের নিশ্চিতকরণ। একই পরিশোধ দ্বিতীয়বার নিশ্চিত করলে কিছুই বদলায় না।
create function public.confirm_payment(p_id uuid) returns text
language plpgsql security definer set search_path = public, private as $$
declare py payments; me uuid;
begin
  select * into py from payments where id = p_id for update;
  if not found then raise exception 'পরিশোধটি পাওয়া যায়নি।'; end if;
  me := private.my_member_any(py.group_id);
  if me is distinct from py.to_id then raise exception 'শুধু যিনি টাকা পাবেন তিনিই নিশ্চিত করতে পারবেন।'; end if;
  if py.status = 'confirmed' then return 'confirmed'; end if;
  if py.status <> 'pending' then raise exception 'এই পরিশোধ আর নিশ্চিত করা যাবে না।'; end if;
  update payments set status = 'confirmed', resolved_at = now() where id = p_id;
  perform private.log(py.group_id, me, 'payment_confirmed',
    private.mname(me) || ' ' || private.mname(py.from_id) || '-এর ' || private.money_gen(py.group_id, py.amount) || ' পরিশোধ পাওয়ার কথা নিশ্চিত করেছেন।');
  return 'confirmed';
end $$;

create function public.reject_payment(p_id uuid) returns text
language plpgsql security definer set search_path = public, private as $$
declare py payments; me uuid;
begin
  select * into py from payments where id = p_id for update;
  if not found then raise exception 'পরিশোধটি পাওয়া যায়নি।'; end if;
  me := private.my_member_any(py.group_id);
  if me is distinct from py.to_id then raise exception 'শুধু যিনি টাকা পাবেন তিনিই এটি করতে পারবেন।'; end if;
  if py.status <> 'pending' then return py.status; end if;
  update payments set status = 'rejected', resolved_at = now() where id = p_id;
  perform private.log(py.group_id, me, 'payment_rejected',
    private.mname(me) || ' ' || private.mname(py.from_id) || '-এর ' || private.money_gen(py.group_id, py.amount) || ' পরিশোধ পাননি বলে জানিয়েছেন।');
  return 'rejected';
end $$;

create function public.cancel_payment(p_id uuid) returns text
language plpgsql security definer set search_path = public, private as $$
declare py payments; me uuid;
begin
  select * into py from payments where id = p_id for update;
  if not found then raise exception 'পরিশোধটি পাওয়া যায়নি।'; end if;
  me := private.my_member_any(py.group_id);
  if me is distinct from py.from_id then raise exception 'শুধু যিনি লিখেছেন তিনিই বাতিল করতে পারবেন।'; end if;
  if py.status <> 'pending' then return py.status; end if;
  update payments set status = 'cancelled', resolved_at = now() where id = p_id;
  return 'cancelled';
end $$;

create function public.month_report(p_group uuid, p_month date) returns jsonb
language plpgsql security definer set search_path = public, private as $$
declare m date := private.month_start(p_month); fin months;
begin
  if private.my_member_any(p_group) is null then raise exception 'এই গ্রুপে আপনার অনুমতি নেই।'; end if;
  select * into fin from months where group_id = p_group and month = m;
  if found then
    return fin.report || jsonb_build_object('status', 'finalized', 'finalized_at', fin.finalized_at,
                                            'finalized_by_name', private.mname(fin.finalized_by));
  end if;
  return private.compute_report(p_group, m) || jsonb_build_object('status', 'open');
end $$;

create function public.group_months(p_group uuid) returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
begin
  if private.my_member_any(p_group) is null then raise exception 'এই গ্রুপে আপনার অনুমতি নেই।'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('month', x.m, 'finalized', exists (select 1 from months t where t.group_id = p_group and t.month = x.m)) order by x.m desc)
    from (select private.month_start(private.today()) as m
          union select month from purchases where group_id = p_group and deleted_at is null
          union select month from payments where group_id = p_group
          union select month from months where group_id = p_group) x), '[]'::jsonb);
end $$;

-- সংশোধনের অনুরোধ: পরের মাসের প্রথম দুই দিন, মাস চূড়ান্ত না হলে
create function public.request_correction(p_group uuid, p_token uuid, p_month date, p_kind text, p_purchase uuid,
                                          p_date date, p_buyer uuid, p_desc text, p_amount bigint,
                                          p_items jsonb, p_reason text) returns uuid
language plpgsql security definer set search_path = public, private as $$
declare me uuid := private.my_member(p_group); m date := private.month_start(p_month); existing uuid; cid uuid; today date := private.today();
        pr purchases; total bigint := 0; it jsonb;
begin
  if me is null then raise exception 'আপনি এই গ্রুপের সক্রিয় সদস্য নন।'; end if;
  select id into existing from corrections where group_id = p_group and client_token = p_token;
  if existing is not null then return existing; end if;
  if private.is_final(p_group, m) then raise exception 'এই মাসের হিসাব চূড়ান্ত হয়ে গেছে।'; end if;
  if not (today >= (m + interval '1 month')::date and today <= (m + interval '1 month')::date + 1) then
    raise exception 'সংশোধনের অনুরোধ শুধু পরের মাসের প্রথম দুই দিন করা যায়।';
  end if;
  if p_kind not in ('add','edit','delete') then raise exception 'অনুরোধের ধরন ঠিক নয়।'; end if;
  if p_kind in ('edit','delete') then
    select * into pr from purchases where id = p_purchase and group_id = p_group and deleted_at is null and month = m;
    if not found then raise exception 'বাজারটি এই মাসে পাওয়া যায়নি।'; end if;
  end if;
  if p_kind in ('add','edit') then
    if p_date is null or private.month_start(p_date) <> m then raise exception 'তারিখ ওই মাসের ভেতরে হতে হবে।'; end if;
    if not exists (select 1 from members where id = p_buyer and group_id = p_group) then raise exception 'ক্রেতা ঠিক নয়।'; end if;
    p_items := coalesce(p_items, '[]'::jsonb);
    if jsonb_array_length(p_items) > 0 then
      for it in select * from jsonb_array_elements(p_items) loop total := total + (it->>'amount')::bigint; end loop;
      p_amount := total;
    end if;
    if p_amount is null or p_amount <= 0 then raise exception 'খরচের টাকা শূন্যের বেশি হতে হবে।'; end if;
    if btrim(coalesce(p_desc, '')) = '' then raise exception 'কী কিনেছেন লিখুন।'; end if;
  end if;
  insert into corrections(group_id, month, requested_by, kind, purchase_id, bazar_date, buyer_id, description, amount, items, reason, client_token)
  values (p_group, m, me, p_kind, p_purchase, p_date, p_buyer, btrim(p_desc), p_amount, coalesce(p_items, '[]'::jsonb), nullif(btrim(p_reason), ''), p_token)
  returning id into cid;
  perform private.log(p_group, me, 'correction_requested',
    private.mname(me) || ' ' || private.month_label(m) || ' মাসের জন্য বাজার সংশোধনের অনুরোধ করেছেন।');
  return cid;
end $$;

-- অ্যাডমিনের জন্য তালিকা: তারিখ, টাকা ও কার ভাগ কত বদলাবে
create function public.list_corrections(p_group uuid, p_month date) returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
declare m date := private.month_start(p_month);
begin
  if private.my_member_any(p_group) is null then raise exception 'এই গ্রুপে আপনার অনুমতি নেই।'; end if;
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

create function public.resolve_correction(p_id uuid, p_approve boolean, p_note text default null) returns text
language plpgsql security definer set search_path = public, private as $$
declare c corrections; me uuid; req_name text; pr purchases;
begin
  select * into c from corrections where id = p_id for update;
  if not found then raise exception 'অনুরোধটি পাওয়া যায়নি।'; end if;
  if not private.is_admin(c.group_id) then raise exception 'শুধু অ্যাডমিন অনুরোধ নিষ্পত্তি করতে পারবেন।'; end if;
  me := private.my_member(c.group_id);
  if c.status <> 'pending' then return c.status; end if;
  if private.is_final(c.group_id, c.month) then raise exception 'এই মাসের হিসাব চূড়ান্ত হয়ে গেছে।'; end if;
  req_name := private.mname(c.requested_by);
  if p_approve then
    if c.kind = 'add' then
      perform private.upsert_purchase(c.group_id, null, gen_random_uuid(), c.bazar_date, c.buyer_id, c.description, c.amount, c.items, c.requested_by);
    elsif c.kind = 'edit' then
      select * into pr from purchases where id = c.purchase_id and deleted_at is null;
      if not found then raise exception 'বাজারটি আর নেই।'; end if;
      perform private.upsert_purchase(c.group_id, c.purchase_id, null, c.bazar_date, c.buyer_id, c.description, c.amount, c.items, pr.created_by);
    else
      update purchases set deleted_at = now() where id = c.purchase_id and deleted_at is null;
      delete from purchase_shares where purchase_id = c.purchase_id;
    end if;
    update corrections set status = 'approved', resolved_by = me, resolved_at = now(), resolve_note = nullif(btrim(p_note), '') where id = p_id;
    perform private.log(c.group_id, me, 'correction_approved', 'অ্যাডমিন ' || req_name || '-এর সংশোধনের অনুরোধ অনুমোদন করেছেন।');
    return 'approved';
  end if;
  update corrections set status = 'rejected', resolved_by = me, resolved_at = now(), resolve_note = nullif(btrim(p_note), '') where id = p_id;
  perform private.log(c.group_id, me, 'correction_rejected', 'অ্যাডমিন ' || req_name || '-এর সংশোধনের অনুরোধ বাতিল করেছেন।');
  return 'rejected';
end $$;

-- মাস চূড়ান্ত করা (শুধু অ্যাডমিন; মাস শেষ হওয়ার পর)
create function public.finalize_month(p_group uuid, p_month date, p_force boolean default false) returns jsonb
language plpgsql security definer set search_path = public, private as $$
declare m date := private.month_start(p_month); me uuid := private.my_member(p_group); pc int; pp int; snap jsonb;
begin
  if not private.is_admin(p_group) then raise exception 'শুধু অ্যাডমিন হিসাব চূড়ান্ত করতে পারবেন।'; end if;
  if private.is_final(p_group, m) then raise exception 'এই মাস আগেই চূড়ান্ত হয়েছে।'; end if;
  if private.today() < (m + interval '1 month')::date then raise exception 'মাস শেষ হওয়ার আগে হিসাব চূড়ান্ত করা যাবে না।'; end if;
  select count(*) into pc from corrections where group_id = p_group and month = m and status = 'pending';
  select count(*) into pp from payments where group_id = p_group and month = m and status = 'pending';
  if (pc > 0 or pp > 0) and not p_force then
    return jsonb_build_object('ok', false, 'pending_corrections', pc, 'pending_payments', pp);
  end if;
  snap := private.compute_report(p_group, m);
  update corrections set status = 'rejected', resolved_by = me, resolved_at = now(), resolve_note = 'মাস চূড়ান্ত হওয়ায় বাতিল'
    where group_id = p_group and month = m and status = 'pending';
  update payments set status = 'expired', resolved_at = now() where group_id = p_group and month = m and status = 'pending';
  insert into months(group_id, month, finalized_by, report) values (p_group, m, me, snap);
  perform private.log(p_group, me, 'month_finalized', 'অ্যাডমিন ' || private.month_label(m) || ' মাসের হিসাব চূড়ান্ত করেছেন।');
  return jsonb_build_object('ok', true);
end $$;

-- খাওয়ার বিরতি
create function public.set_pause(p_group uuid, p_start date, p_end date default null) returns uuid
language plpgsql security definer set search_path = public, private as $$
declare me uuid := private.my_member(p_group); pid uuid;
begin
  if me is null then raise exception 'আপনি এই গ্রুপের সক্রিয় সদস্য নন।'; end if;
  if p_start is null then raise exception 'বিরতি শুরুর তারিখ দিন।'; end if;
  if p_end is not null and p_end <= p_start then raise exception 'ফেরার তারিখ শুরুর তারিখের পরে হতে হবে।'; end if;
  if p_start < private.month_start(private.today()) then raise exception 'চলতি মাসের আগের তারিখ থেকে বিরতি দেওয়া যাবে না।'; end if;
  insert into pauses(member_id, group_id, start_date, end_date) values (me, p_group, p_start, p_end) returning id into pid;
  perform private.recompute_from(p_group, p_start);
  perform private.log(p_group, me, 'pause_started', private.mname(me) || ' ' || private.date_label(p_start) || ' থেকে খাওয়ার বিরতিতে'
    || case when p_end is not null then ' (ফিরবেন ' || private.date_label(p_end) || ')' else '' end || '।');
  return pid;
end $$;

create function public.end_pause(p_pause uuid, p_return date default null) returns void
language plpgsql security definer set search_path = public, private as $$
declare pz pauses; me uuid; r date;
begin
  select * into pz from pauses where id = p_pause;
  if not found then return; end if;
  me := private.my_member(pz.group_id);
  if me is distinct from pz.member_id then raise exception 'শুধু নিজের বিরতি বদলানো যাবে।'; end if;
  r := coalesce(p_return, private.today());
  if r <= pz.start_date then
    delete from pauses where id = p_pause;
    perform private.recompute_from(pz.group_id, pz.start_date);
  else
    update pauses set end_date = r where id = p_pause;
    perform private.recompute_from(pz.group_id, least(r, coalesce(pz.end_date, r)));
  end if;
  perform private.log(pz.group_id, me, 'pause_ended', private.mname(me) || ' ' || private.date_label(r) || ' থেকে আবার খাওয়ায় ফিরছেন।');
end $$;

create function public.transfer_admin(p_group uuid, p_member uuid) returns void
language plpgsql security definer set search_path = public, private as $$
declare me uuid := private.my_member(p_group);
begin
  if not private.is_admin(p_group) then raise exception 'শুধু অ্যাডমিন দায়িত্ব দিতে পারবেন।'; end if;
  if not exists (select 1 from members where id = p_member and group_id = p_group and left_on is null and user_id is not null) then
    raise exception 'নির্বাচিত সদস্য সক্রিয় নন।';
  end if;
  update members set role = 'admin' where id = p_member;
  update members set role = 'member' where id = me and id <> p_member;
  perform private.log(p_group, me, 'admin_transferred', private.mname(p_member) || ' এখন গ্রুপের অ্যাডমিন।');
end $$;

create function private.do_leave(g uuid, mid uuid) returns void
language plpgsql security definer set search_path = public, private as $$
declare tomorrow date := private.today() + 1;
begin
  update members set left_on = tomorrow where id = mid;   -- আজকের বাজার পর্যন্ত ভাগ থাকে; পরের বাজার থেকে নয়
  delete from pauses where member_id = mid and start_date >= tomorrow;
  update pauses set end_date = tomorrow where member_id = mid and (end_date is null or end_date > tomorrow) and start_date < tomorrow;
  perform private.recompute_from(g, tomorrow);
  perform private.log(g, mid, 'member_left', (select display_name from members where id = mid) || ' গ্রুপ ছেড়েছেন।');
end $$;

create function public.leave_group(p_group uuid) returns void
language plpgsql security definer set search_path = public, private as $$
declare me uuid := private.my_member(p_group); others int;
begin
  if me is null then raise exception 'আপনি এই গ্রুপের সক্রিয় সদস্য নন।'; end if;
  select count(*) into others from members where group_id = p_group and left_on is null and id <> me;
  if others = 0 then raise exception 'আপনিই একমাত্র সদস্য। গ্রুপ ছাড়ার বদলে গ্রুপটি মুছে ফেলুন।'; end if;
  if private.is_admin(p_group) and not exists (select 1 from members where group_id = p_group and left_on is null and role = 'admin' and id <> me) then
    raise exception 'আপনি একমাত্র অ্যাডমিন। আগে অন্য সদস্যকে অ্যাডমিনের দায়িত্ব দিন।';
  end if;
  perform private.do_leave(p_group, me);
end $$;

create function public.delete_group(p_group uuid) returns void
language plpgsql security definer set search_path = public, private as $$
begin
  if not private.is_admin(p_group) then raise exception 'শুধু অ্যাডমিন গ্রুপ মুছতে পারবেন।'; end if;
  delete from groups where id = p_group;
end $$;

create function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, private as $$
declare r record; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'আগে সাইন ইন করুন।'; end if;
  for r in select m.id, m.group_id, m.role from members m where m.user_id = uid and m.left_on is null loop
    if not exists (select 1 from members where group_id = r.group_id and left_on is null and id <> r.id) then
      delete from groups where id = r.group_id;                 -- আপনিই একমাত্র সদস্য: গ্রুপও যাবে
    elsif r.role = 'admin' and not exists (select 1 from members where group_id = r.group_id and left_on is null and role = 'admin' and id <> r.id) then
      raise exception 'আপনি একটি গ্রুপের একমাত্র অ্যাডমিন। আগে অন্য সদস্যকে অ্যাডমিনের দায়িত্ব দিন।';
    end if;
  end loop;
  for r in select m.id, m.group_id from members m where m.user_id = uid and m.left_on is null loop
    perform private.do_leave(r.group_id, r.id);
  end loop;
  -- সদস্য-রেকর্ড ও নাম থেকে যায় (user_id ফাঁকা হয়), তাই অন্যদের পুরোনো হিসাব বদলায় না
  delete from auth.users where id = uid;
end $$;

-- পুশ নোটিফিকেশন
create function public.set_push(p_enabled boolean) returns void
language sql security definer set search_path = public as
$$ update profiles set push_enabled = p_enabled where id = auth.uid() $$;

create function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'আগে সাইন ইন করুন।'; end if;
  insert into push_subscriptions(user_id, endpoint, p256dh, auth) values (auth.uid(), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth;
  update profiles set push_enabled = true where id = auth.uid();
end $$;

create function public.remove_push_subscription(p_endpoint text) returns void
language sql security definer set search_path = public as
$$ delete from push_subscriptions where endpoint = p_endpoint and user_id = auth.uid() $$;

-- ───────────────────────── RLS ও অনুমতি ─────────────────────────

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.members enable row level security;
alter table public.pauses enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;
alter table public.purchase_shares enable row level security;
alter table public.payments enable row level security;
alter table public.months enable row level security;
alter table public.corrections enable row level security;
alter table public.events enable row level security;
alter table public.push_subscriptions enable row level security;

create policy profiles_self on public.profiles for select using (id = auth.uid());
create policy groups_read on public.groups for select using (private.can_view(id));
create policy members_read on public.members for select using (private.can_view(group_id));
create policy pauses_read on public.pauses for select using (private.can_view(group_id));
create policy purchases_read on public.purchases for select using (private.can_view(group_id));
create policy items_read on public.purchase_items for select using (private.can_view(group_id));
create policy shares_read on public.purchase_shares for select using (private.can_view(group_id));
create policy payments_read on public.payments for select using (private.can_view(group_id));
create policy months_read on public.months for select using (private.can_view(group_id));
create policy corrections_read on public.corrections for select using (private.can_view(group_id));
create policy events_read on public.events for select using (private.can_view(group_id));
-- push_subscriptions: কোনো পলিসি নেই → সরাসরি অ্যাক্সেস নেই

revoke all on all tables in schema public from anon, authenticated;
grant select on public.profiles, public.groups, public.members, public.pauses, public.purchases,
  public.purchase_items, public.purchase_shares, public.payments, public.months, public.corrections, public.events
  to authenticated;

grant usage on schema private to authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.can_view(uuid) to authenticated;
grant execute on function private.today() to authenticated;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to authenticated;
grant execute on function public.group_name_by_code(text) to anon;

-- অন্য সদস্যের নতুন খবর এলে অ্যাপ স্বয়ংক্রিয়ভাবে হালনাগাদ হওয়ার জন্য (Supabase Realtime)
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.events;
  end if;
end $$;
