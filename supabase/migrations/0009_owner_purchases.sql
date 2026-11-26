-- Ownership follows the recorded buyer, including entries historically entered on their behalf.
create or replace function public.add_purchase(p_group uuid, p_token uuid, p_date date, p_buyer uuid, p_desc text,
                                    p_amount bigint, p_items jsonb default '[]') returns uuid
language plpgsql security definer set search_path = public, private as $$
declare me uuid := private.my_member(p_group); existing uuid; pid uuid; pr purchases;
begin
  if p_buyer is not null and p_buyer is distinct from me then raise exception 'শুধু নিজের বাজার লেখা যাবে।'; end if;
  if me is null then raise exception 'আপনি এই গ্রুপের সক্রিয় সদস্য নন।'; end if;
  select id into existing from purchases where group_id = p_group and client_token = p_token and buyer_id = me;
  if existing is not null then return existing; end if;
  if private.month_start(p_date) <> private.month_start(private.today()) then
    raise exception 'আগের মাসের বাজার সরাসরি লেখা যাবে না। রিপোর্ট থেকে সংশোধনের অনুরোধ করুন।';
  end if;
  begin
    pid := private.upsert_purchase(p_group, null, p_token, p_date, coalesce(p_buyer, me), p_desc, p_amount, p_items, me);
  exception when unique_violation then
    select id into existing from purchases where group_id = p_group and client_token = p_token and buyer_id = me;
    if existing is null then raise; end if;
    return existing;
  end;
  select * into pr from purchases where id = pid;
  perform private.log(p_group, me, 'purchase_added',
    private.mname(pr.buyer_id) || ' ' || private.money_gen(p_group, pr.amount) || ' ' || pr.description || ' কিনেছেন।');
  return pid;
end $$;

create or replace function public.update_purchase(p_id uuid, p_date date, p_buyer uuid, p_desc text, p_amount bigint, p_items jsonb default '[]') returns uuid
language plpgsql security definer set search_path = public, private as $$
declare pr purchases; me uuid; pid uuid;
begin
  select * into pr from purchases where id = p_id and deleted_at is null for update;
  if not found then raise exception 'বাজারটি পাওয়া যায়নি।'; end if;
  me := private.my_member(pr.group_id);
  if me is null then raise exception 'আপনি এই গ্রুপের সক্রিয় সদস্য নন।'; end if;
  if pr.buyer_id is distinct from me or p_buyer is distinct from me then raise exception 'শুধু নিজের লেখা বাজার সংশোধন করা যাবে।'; end if;
  if private.month_start(p_date) <> pr.month then
    raise exception 'তারিখ একই হিসাবের মাসে হতে হবে।';
  end if;
  pid := private.upsert_purchase(pr.group_id, p_id, null, p_date, p_buyer, p_desc, p_amount, p_items, me);
  select * into pr from purchases where id = pid;
  perform private.log(pr.group_id, me, 'purchase_edited',
    private.mname(me) || ' একটি বাজার সংশোধন করেছেন: ' || pr.description || ', ' || private.money(pr.group_id, pr.amount) || '।');
  return pid;
end $$;

create or replace function public.delete_purchase(p_id uuid) returns void
language plpgsql security definer set search_path = public, private as $$
declare pr purchases; me uuid;
begin
  select * into pr from purchases where id = p_id and deleted_at is null for update;
  if not found then return; end if;
  me := private.my_member(pr.group_id);
  if me is null then raise exception 'আপনি এই গ্রুপের সক্রিয় সদস্য নন।'; end if;
  if pr.buyer_id is distinct from me then raise exception 'শুধু নিজের লেখা বাজার মুছতে পারবেন।'; end if;
  update purchases set deleted_at = now() where id = p_id;
  delete from purchase_shares where purchase_id = p_id;
  perform private.log(pr.group_id, me, 'purchase_deleted',
    private.mname(me) || ' ' || private.money_gen(pr.group_id, pr.amount) || ' ' || pr.description || ' বাজারটি মুছে ফেলেছেন।');
end $$;
-- Direct owner edits replace the older admin-approved purchase mutation path.
revoke execute on function public.resolve_correction(uuid,boolean,text),
 public.request_correction(uuid,uuid,date,text,uuid,date,uuid,text,bigint,jsonb,text)
 from public, anon, authenticated;

create or replace function private.is_admin(g uuid) returns boolean
language sql stable security definer set search_path = '' as $$
 select exists (select 1 from public.members m join auth.users u on u.id=m.user_id
 where m.group_id=g and m.user_id=auth.uid() and m.left_on is null and m.role='admin'
 and nullif(u.email,'') is not null)
$$;

-- Member invitations can create one membership, never assume an existing identity.
create or replace function public.issue_access_link(p_group uuid, p_label text, p_target uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare result uuid;
begin
  if not private.is_admin(p_group) then raise exception 'শুধু অ্যাডমিন আমন্ত্রণ পাঠাতে পারবেন।'; end if;
  if p_target is not null then raise exception 'অন্য সদস্যের লগইন তৈরি করা যাবে না।'; end if;
  if coalesce(length(trim(p_label)),0) not between 1 and 100 then raise exception 'সদস্যের নাম লিখুন।'; end if;
  insert into private.access_links(group_id,label,purpose) values(p_group,trim(p_label),'join') returning token into result;
  return result;
end $$;

create or replace function public.accept_access_link(p_token uuid,p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare invitation private.access_links; internal_code text;
begin
  if auth.uid() is null then raise exception 'সেশন শুরু করুন।'; end if;
  delete from private.access_links where token=p_token and purpose='join' returning * into invitation;
  if not found or not private.link_live(invitation.purpose,invitation.created_at) then
    raise exception 'আমন্ত্রণের মেয়াদ শেষ অথবা এটি ব্যবহৃত হয়েছে।';
  end if;
  if private.my_member(invitation.group_id) is not null then raise exception 'আপনি ইতিমধ্যে সদস্য।'; end if;
  if coalesce(length(trim(p_name)),0) not between 1 and 100 then raise exception 'সদস্যের নাম লিখুন।'; end if;
  select invite_code into internal_code from public.groups where id=invitation.group_id;
  perform private.join_group(internal_code, p_name);
  return invitation.group_id;
end $$;

create or replace function public.preview_access_link(p_token uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
 select jsonb_build_object('group_name',g.name,'label',l.label,'purpose',l.purpose)
 from private.access_links l join public.groups g on g.id=l.group_id
 where l.token=p_token and l.purpose='join' and private.link_live(l.purpose,l.created_at)
$$;

create or replace function public.pending_access_links(p_group uuid)
returns table(token uuid,label text,purpose text,expires_at timestamptz)
language sql stable security definer set search_path = '' as $$
 select l.token,l.label,l.purpose,l.created_at + private.link_ttl(l.purpose)
 from private.access_links l where l.group_id=p_group and private.is_admin(p_group)
 and l.purpose='join' and private.link_live(l.purpose,l.created_at) order by l.created_at desc
$$;

create or replace function private.check_admin_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.role='admin' and new.left_on is null and not exists (
    select 1 from auth.users where id=new.user_id and nullif(email,'') is not null
  ) then raise exception 'অ্যাডমিন হতে আগে ইমেইল অ্যাকাউন্ট যুক্ত করুন।'; end if;
  return new;
end $$;
create trigger require_admin_email before insert or update of role,user_id on public.members
for each row execute function private.check_admin_email();

create or replace function public.finalize_month(p_group uuid, p_month date, p_force boolean default false) returns jsonb
language plpgsql security definer set search_path = public, private as $$
declare m date := private.month_start(p_month); me uuid := private.my_member(p_group); pc int; pp int; snap jsonb;
begin
  if not private.is_admin(p_group) then raise exception 'শুধু অ্যাডমিন হিসাব চূড়ান্ত করতে পারবেন।'; end if;
  if private.is_final(p_group, m) then raise exception 'এই মাস আগেই চূড়ান্ত হয়েছে।'; end if;
  if m > private.month_start(private.today()) then raise exception 'ভবিষ্যতের হিসাব বন্ধ করা যাবে না।'; end if;
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
