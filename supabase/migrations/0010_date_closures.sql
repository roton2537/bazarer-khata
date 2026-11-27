-- A closed date freezes purchases and splits. The group, members and other dates stay open.
create table public.closed_dates (
  group_id uuid not null references public.groups on delete cascade,
  ledger_date date not null,
  closed_by uuid references public.members on delete set null,
  closed_at timestamptz not null default now(),
  report jsonb not null,
  primary key (group_id, ledger_date)
);
alter table public.closed_dates enable row level security;
create policy closed_dates_read on public.closed_dates for select using
  (private.can_view_month(group_id,date_trunc('month',ledger_date::timestamp)::date));
revoke all on public.closed_dates from anon,authenticated;
grant select on public.closed_dates to authenticated;

create function private.date_closed(g uuid,d date) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.closed_dates where group_id=g and ledger_date=d)
$$;

create function private.check_purchase_date() returns trigger
language plpgsql security definer set search_path='' as $$
declare g uuid := coalesce(new.group_id,old.group_id);
begin
  perform pg_advisory_xact_lock(hashtextextended(g::text,0));
  if (tg_op <> 'INSERT' and private.date_closed(g,old.bazar_date))
     or (tg_op <> 'DELETE' and private.date_closed(g,new.bazar_date)) then
    raise exception 'এই তারিখের বাজার বন্ধ হয়েছে।';
  end if;
  return coalesce(new,old);
end $$;
create trigger check_purchase_date before insert or update or delete on public.purchases
for each row execute function private.check_purchase_date();

create or replace function private.recompute_from(g uuid, from_date date) returns void
language plpgsql security definer set search_path='' as $$
declare r record;
begin
  perform pg_advisory_xact_lock(hashtextextended(g::text,0));
  for r in select id from public.purchases where group_id=g and bazar_date>=from_date and deleted_at is null
    and not private.is_final(g,month) and not private.date_closed(g,bazar_date)
  loop perform private.recompute_purchase(r.id); end loop;
end $$;

create function public.close_ledger_date(p_group uuid,p_date date) returns void
language plpgsql security definer set search_path='' as $$
declare snapshot jsonb;
begin
  if not private.is_admin(p_group) then raise exception 'শুধু অ্যাডমিন তারিখ বন্ধ করতে পারবেন।'; end if;
  if p_date is null or p_date > private.today() or private.is_final(p_group,private.month_start(p_date)) then
    raise exception 'খোলা মাসের আজ অথবা আগের তারিখ দিন।'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_group::text,0));
  if private.date_closed(p_group,p_date) then return; end if;
  select jsonb_build_object('total',coalesce(sum(p.amount),0),'count',count(*),
    'purchases', coalesce(jsonb_agg(jsonb_build_object('id',p.id,'description',p.description,
      'buyer',private.mname(p.buyer_id),'amount',p.amount,'shares',
      (select jsonb_agg(jsonb_build_object('member',private.mname(s.member_id),'share',s.share) order by s.member_id)
       from public.purchase_shares s where s.purchase_id=p.id)) order by p.created_at,p.id),'[]'::jsonb))
    into snapshot from public.purchases p where p.group_id=p_group and p.bazar_date=p_date and p.deleted_at is null;
  insert into public.closed_dates(group_id,ledger_date,closed_by,report)
    values(p_group,p_date,private.my_member(p_group),snapshot);
  perform private.log(p_group,private.my_member(p_group),'date_closed',p_date::text || ' তারিখের বাজার বন্ধ হয়েছে।');
end $$;
revoke all on function public.close_ledger_date(uuid,date) from public,anon;
grant execute on function public.close_ledger_date(uuid,date) to authenticated;
revoke execute on function public.finalize_month(uuid,date,boolean) from public,anon,authenticated;
