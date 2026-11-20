-- 0006: অ্যাডমিনের রিকভারি কোড সংরক্ষণের স্বীকৃতি + পেমেন্ট নিশ্চিত করার রিমাইন্ডার

-- ১. রিকভারি কোড সংরক্ষণ: অ্যাডমিন না জানানো পর্যন্ত অ্যাপ কোডটি দেখাতে থাকবে
alter table public.members add column recovery_saved_at timestamptz;

-- নতুন অ্যাডমিন বা নতুন ফোনে সরে গেলে কোড নতুন হয়, তাই স্বীকৃতি আবার নিতে হবে
create function private.reset_recovery_ack() returns trigger language plpgsql as $$
begin
  if new.user_id is distinct from old.user_id or new.role is distinct from old.role then
    new.recovery_saved_at := null;
  end if;
  return new;
end $$;
create trigger reset_recovery_ack before update of user_id, role on public.members
for each row execute function private.reset_recovery_ack();

create function public.ack_recovery(p_group uuid) returns void
language plpgsql security definer set search_path = public, private as $$
begin
  if not private.is_admin(p_group) then raise exception 'শুধু অ্যাডমিন।'; end if;
  update members set recovery_saved_at = now() where id = private.my_member(p_group) and role = 'admin';
end $$;
revoke all on function public.ack_recovery(uuid) from public, anon;
grant execute on function public.ack_recovery(uuid) to authenticated;

-- ২. পেমেন্টের রিমাইন্ডার: দাতা প্রাপককে মনে করান; একই পেমেন্টে ২৪ ঘণ্টায় একবার
alter table public.payments add column reminded_at timestamptz;

create function public.remind_payment(p_id uuid) returns void
language plpgsql security definer set search_path = public, private as $$
declare py payments; me uuid;
begin
  select * into py from payments where id = p_id for update;
  if not found then raise exception 'পরিশোধটি পাওয়া যায়নি।'; end if;
  me := private.my_member_any(py.group_id);
  if me is distinct from py.from_id then raise exception 'শুধু যিনি টাকা দিয়েছেন তিনিই মনে করাতে পারবেন।'; end if;
  if py.status <> 'pending' then raise exception 'পরিশোধটি এখন আর নিশ্চিতের অপেক্ষায় নেই।'; end if;
  if private.is_final(py.group_id, py.month) then raise exception 'এই মাসের হিসাব চূড়ান্ত হয়ে গেছে।'; end if;
  if py.reminded_at is not null and py.reminded_at > now() - interval '24 hours' then
    raise exception 'আজ ইতিমধ্যে মনে করানো হয়েছে। ২৪ ঘণ্টা পরে আবার চেষ্টা করুন।';
  end if;
  update payments set reminded_at = now() where id = p_id;
  perform private.log(py.group_id, me, 'payment_reminder',
    private.mname(me) || ' ' || private.mname(py.to_id) || '-কে ' || private.money(py.group_id, py.amount) || ' পরিশোধ নিশ্চিত করতে মনে করিয়েছেন।');
end $$;
revoke all on function public.remind_payment(uuid) from public, anon;
grant execute on function public.remind_payment(uuid) to authenticated;
