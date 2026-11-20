// 0005 মাইগ্রেশনের পরীক্ষা: গোপনীয়তা, মেয়াদ, সদস্য-অপসারণ, ঘটনা-লগ, সীমা
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newDb, Ctx, uuid, T, fourMembers } from './helpers.js';

const make = async () => { const ctx = new Ctx(await newDb()); const g = await fourMembers(ctx); return { ctx, ...g }; };

test('১৬. সাবেক সদস্য শুধু ছাড়ার মাস পর্যন্ত দেখেন, পরের মাস নয়', async () => {
  const { ctx, gid, mem } = await make();
  await ctx.setToday('2026-11-05');
  await ctx.rpc('rahim', 'add_purchase', gid, uuid(), '2026-11-05', mem.rahim, 'নভেম্বরের বাজার', T(400), '[]');
  await ctx.rpc('salam', 'leave_group', gid);
  await ctx.setToday('2026-12-10');
  await ctx.rpc('rahim', 'add_purchase', gid, uuid(), '2026-12-10', mem.rahim, 'ডিসেম্বরের গোপন বাজার', T(900), '[]');
  // পরীক্ষায় ঘড়ি নকল, তাই ঘটনার সময় ঘড়ির সঙ্গে মিলিয়ে নিই
  await ctx.admin(`update events set created_at = '2026-12-10 12:00+06' where message like '%ডিসেম্বরের গোপন%'`);
  await ctx.admin(`update events set created_at = '2026-11-05 12:00+06' where created_at < '2026-12-01' and message not like '%ডিসেম্বরের গোপন%'`);
  // নভেম্বর দেখা যায় (দেনা মেটানোর জন্য)
  assert.equal((await ctx.rpc('salam', 'month_report', gid, '2026-11-01')).total, T(400));
  assert.equal((await ctx.as('salam', `select count(*)::int c from purchases where month='2026-11-01'`)).rows[0].c, 1);
  // ডিসেম্বর দেখা যায় না
  await ctx.fails(ctx.rpc('salam', 'month_report', gid, '2026-12-01'), /সদস্য ছিলেন না/);
  assert.equal((await ctx.as('salam', `select count(*)::int c from purchases where month='2026-12-01'`)).rows[0].c, 0);
  assert.equal((await ctx.as('salam', `select count(*)::int c from purchase_shares`)).rows[0].c, 4);
  assert.equal((await ctx.as('salam', `select count(*)::int c from events where message like '%ডিসেম্বরের গোপন%'`)).rows[0].c, 0);
  const months = await ctx.rpc('salam', 'group_months', gid);
  assert.ok(months.every((m) => m.month < '2026-12-01'));
  // সক্রিয় সদস্য সব দেখেন
  assert.equal((await ctx.rpc('rahim', 'month_report', gid, '2026-12-01')).total, T(900));
});

test('১৭. অ্যাডমিন সদস্য সরাতে পারেন; সাধারণ সদস্য পারেন না; অ্যাডমিন বা নিজেকে নয়', async () => {
  const { ctx, gid, mem } = await make();
  await ctx.fails(ctx.rpc('karim', 'remove_member', gid, mem.abdul), /শুধু অ্যাডমিন/);
  await ctx.fails(ctx.rpc('rahim', 'remove_member', gid, mem.rahim), /নিজেকে/);
  await ctx.rpc('rahim', 'remove_member', gid, mem.salam);
  assert.ok((await ctx.admin('select left_on from members where id=$1', [mem.salam])).rows[0].left_on);
  await ctx.fails(ctx.rpc('salam', 'add_purchase', gid, uuid(), '2026-11-01', mem.salam, 'x', T(10), '[]'), /সক্রিয় সদস্য নন/);
  await ctx.fails(ctx.rpc('rahim', 'remove_member', gid, mem.salam), /সক্রিয় নন/);
  const ev = (await ctx.as('rahim', `select count(*)::int c from events where kind='member_removed'`)).rows[0].c;
  assert.equal(ev, 1);
});

test('১৮. লিংক ও আমন্ত্রণের মেয়াদ; ব্যাকআপ কোড স্থায়ী', async () => {
  const { ctx, gid, mem } = await make();
  await ctx.user('newbie'); await ctx.user('late');
  // join লিংক ৭ দিন পর অচল
  const tok = await ctx.rpc('rahim', 'issue_access_link', gid, 'নতুন', null);
  await ctx.admin(`update private.access_links set created_at = now() - interval '8 days' where token = $1`, [tok]);
  assert.equal(await ctx.rpc('newbie', 'preview_access_link', tok), null);
  await ctx.fails(ctx.rpc('newbie', 'accept_access_link', tok, 'নতুন'), /মেয়াদ শেষ/);
  // restore লিংক ৩ দিন
  const rt = await ctx.rpc('rahim', 'issue_access_link', gid, '', mem.karim);
  await ctx.admin(`update private.access_links set created_at = now() - interval '4 days' where token = $1`, [rt]);
  await ctx.fails(ctx.rpc('newbie', 'accept_access_link', rt, ''), /মেয়াদ শেষ/);
  // ইমেইল আমন্ত্রণ ১৪ দিন
  const code = await ctx.rpc('rahim', 'create_member_invitation', gid, 'late@x.test');
  await ctx.admin(`update private.member_invitations set created_at = now() - interval '15 days' where code = $1`, [code]);
  assert.equal(await ctx.rpc('late', 'group_name_by_code', code), null);
  await ctx.fails(ctx.rpc('late', 'join_group', code, 'দেরি'), /মেয়াদ শেষ/);
  // নতুন আমন্ত্রণে আবার চলে
  const code2 = await ctx.rpc('rahim', 'create_member_invitation', gid, 'late@x.test');
  await ctx.rpc('late', 'join_group', code2, 'দেরি');
  // অ্যাডমিনের ব্যাকআপ কোড পুরোনো হলেও চলে
  const b = (await ctx.admin(`select token from private.access_links where purpose='backup'`)).rows[0].token;
  await ctx.admin(`update private.access_links set created_at = now() - interval '400 days' where token = $1`, [b]);
  assert.ok(await ctx.rpc('newbie', 'preview_access_link', b));
  const pend = await ctx.rpc('rahim', 'pending_access_links', gid).catch(() => null);
  const rows = (await ctx.as('rahim', 'select * from public.pending_access_links($1)', [gid])).rows;
  assert.ok(rows.some((r) => r.purpose === 'backup' && r.expires_at === null));
});

test('১৯. ফোন-বদলের ঘটনা ফিডে আসে', async () => {
  const { ctx, gid, mem } = await make();
  await ctx.user('karim2');
  const tok = await ctx.rpc('rahim', 'issue_access_link', gid, '', mem.karim);
  await ctx.rpc('karim2', 'accept_access_link', tok, '');
  const rows = (await ctx.as('abdul', `select message from events where kind='device_changed'`)).rows;
  assert.equal(rows.length, 1);
  assert.match(rows[0].message, /করিম.*নতুন ফোনে/);
});

test('২০. একই টোকেন দুবার: একই আইডি; ১০১টি আইটেম বাতিল; অ্যাকাউন্ট-মোছা সদস্যকে পেমেন্ট বন্ধ', async () => {
  const { ctx, gid, mem } = await make();
  await ctx.setToday('2026-11-10');
  const tk = uuid();
  const a = await ctx.rpc('rahim', 'add_purchase', gid, tk, '2026-11-10', mem.rahim, 'চাল', T(100), '[]');
  const b = await ctx.rpc('rahim', 'add_purchase', gid, tk, '2026-11-10', mem.rahim, 'চাল', T(100), '[]');
  assert.equal(a, b);
  // সমান্তরাল দৌড়ের অনুকরণ: আগের চেক ফাঁকি দিয়ে সরাসরি unique লঙ্ঘন ঘটানো হয় না, তবে ব্লকটি unique_violation ধরে
  const items = JSON.stringify(Array.from({ length: 101 }, (_, i) => ({ name: 'আ' + i, amount: 1 })));
  await ctx.fails(ctx.rpc('rahim', 'add_purchase', gid, uuid(), '2026-11-10', mem.rahim, 'বেশি', 101, items), /১০০টি/);
  const ok = JSON.stringify(Array.from({ length: 100 }, (_, i) => ({ name: 'আ' + i, amount: 1 })));
  await ctx.rpc('rahim', 'add_purchase', gid, uuid(), '2026-11-10', mem.rahim, 'ঠিক', 100, ok);
  // অ্যাকাউন্ট মুছলে তাঁকে পেমেন্ট লেখা যায় না
  await ctx.rpc('salam', 'delete_my_account');
  await ctx.fails(ctx.rpc('karim', 'add_payment', gid, uuid(), '2026-11-01', mem.salam, T(10), null), /অ্যাকাউন্ট আর নেই/);
});

test('২১. রিকভারি কোড সংরক্ষণের স্বীকৃতি: নতুন অ্যাডমিন ও ফোন বদলে আবার চাই', async () => {
  const { ctx, gid, mem } = await make();
  const saved = async (n) => (await ctx.admin('select recovery_saved_at from members where id=$1', [mem[n]])).rows[0].recovery_saved_at;
  assert.equal(await saved('rahim'), null);
  await ctx.fails(ctx.rpc('karim', 'ack_recovery', gid), /শুধু অ্যাডমিন/);
  await ctx.rpc('rahim', 'ack_recovery', gid);
  assert.ok(await saved('rahim'));
  // অন্য সদস্যকে অ্যাডমিন করলে তাঁর স্বীকৃতি ফাঁকা
  await ctx.rpc('rahim', 'transfer_admin', gid, mem.karim);
  assert.equal(await saved('karim'), null);
  await ctx.rpc('karim', 'ack_recovery', gid);
  assert.ok(await saved('karim'));
  // নতুন ফোনে সরলে (ব্যাকআপ কোডে) স্বীকৃতি আবার ফাঁকা
  await ctx.user('karim_phone2');
  const b = (await ctx.admin(`select token from private.access_links where purpose='backup' and target=$1`, [mem.karim])).rows[0].token;
  await ctx.rpc('karim_phone2', 'accept_access_link', b, '');
  assert.equal(await saved('karim'), null);
});

test('২২. পেমেন্ট রিমাইন্ডার: শুধু দাতা, ২৪ ঘণ্টায় একবার, নিশ্চিত হলে নয়', async () => {
  const { ctx, gid, mem } = await make();
  await ctx.setToday('2026-11-10');
  const pid = await ctx.rpc('abdul', 'add_payment', gid, uuid(), '2026-11-01', mem.karim, T(50), null);
  await ctx.fails(ctx.rpc('karim', 'remind_payment', pid), /শুধু যিনি টাকা দিয়েছেন/);
  await ctx.fails(ctx.rpc('rahim', 'remind_payment', pid), /শুধু যিনি টাকা দিয়েছেন/);
  await ctx.rpc('abdul', 'remind_payment', pid);
  await ctx.fails(ctx.rpc('abdul', 'remind_payment', pid), /২৪ ঘণ্টা/);
  const ev = (await ctx.as('salam', `select message from events where kind='payment_reminder'`)).rows;
  assert.equal(ev.length, 1); assert.match(ev[0].message, /আব্দুল করিম-কে/);
  await ctx.admin(`update payments set reminded_at = now() - interval '25 hours' where id=$1`, [pid]);
  await ctx.rpc('abdul', 'remind_payment', pid);
  await ctx.rpc('karim', 'confirm_payment', pid);
  await ctx.fails(ctx.rpc('abdul', 'remind_payment', pid), /নিশ্চিতের অপেক্ষায় নেই/);
});

test('২৩. সমন্বয়: শুধু অ্যাডমিন; চলতি মাসে নিশ্চিত ভুক্তি; ব্যালেন্সে প্রভাব; চূড়ান্ত মাস অটুট', async () => {
  const { ctx, gid, mem } = await make();
  await ctx.setToday('2026-11-10');
  await ctx.rpc('rahim', 'add_purchase', gid, uuid(), '2026-11-10', mem.rahim, 'চাল', T(400), '[]');
  await ctx.setToday('2026-12-01');
  await ctx.rpc('rahim', 'finalize_month', gid, '2026-11-01');
  const before = await ctx.rpc('rahim', 'month_report', gid, '2026-11-01');
  await ctx.fails(ctx.rpc('karim', 'add_adjustment', gid, uuid(), mem.karim, mem.rahim, T(10), 'ভুল'), /শুধু অ্যাডমিন/);
  await ctx.fails(ctx.rpc('rahim', 'add_adjustment', gid, uuid(), mem.karim, mem.rahim, T(10), ' '), /কারণ/);
  await ctx.fails(ctx.rpc('rahim', 'add_adjustment', gid, uuid(), mem.karim, mem.karim, T(10), 'ভুল'), /সদস্য ঠিক নয়/);
  const tk = uuid();
  const id = await ctx.rpc('rahim', 'add_adjustment', gid, tk, mem.karim, mem.rahim, T(25), 'নভেম্বরে চাল দুবার ধরা পড়েছিল');
  assert.equal(await ctx.rpc('rahim', 'add_adjustment', gid, tk, mem.karim, mem.rahim, T(25), 'নভেম্বরে চাল দুবার ধরা পড়েছিল'), id);
  const dec = await ctx.rpc('rahim', 'month_report', gid, '2026-12-01');
  const row = (n) => dec.members.find((m) => m.id === mem[n]);
  assert.equal(row('karim').balance, T(25));      // করিম "দিয়েছেন"
  assert.equal(row('rahim').balance, -T(25));     // রহিম "পেয়েছেন"
  assert.equal(dec.members.reduce((a, m) => a + m.balance, 0), 0);
  assert.deepEqual(await ctx.rpc('rahim', 'month_report', gid, '2026-11-01'), before);   // চূড়ান্ত মাস অপরিবর্তিত
  assert.equal((await ctx.as('abdul', `select count(*)::int c from events where kind='adjustment'`)).rows[0].c, 1);
  assert.equal((await ctx.as('abdul', `select kind, note from payments where id=$1`, [id])).rows[0].kind, 'adjustment');
});

test('২৪. বাজারের ইতিহাস: তৈরি, সম্পাদনা, মোছা; সবাই পড়তে পারে, বাইরের কেউ নয়', async () => {
  const { ctx, gid, mem } = await make();
  await ctx.setToday('2026-11-10');
  const pid = await ctx.rpc('rahim', 'add_purchase', gid, uuid(), '2026-11-10', mem.rahim, 'চাল', T(400), '[]');
  await ctx.rpc('karim', 'update_purchase', pid, '2026-11-10', mem.rahim, 'চাল ও ডাল', T(450), '[]').catch(() => null);
  await ctx.rpc('rahim', 'update_purchase', pid, '2026-11-10', mem.rahim, 'চাল ও ডাল', T(450), '[]');
  await ctx.rpc('rahim', 'delete_purchase', pid);
  const h = (await ctx.as('abdul', `select action, snapshot->>'amount' a, (select display_name from members where id=changed_by) who from purchase_history where purchase_id=$1 order by changed_at, action`, [pid])).rows;
  assert.deepEqual(h.map((r) => r.action).sort(), ['created', 'deleted', 'edited']);
  assert.equal(h.find((r) => r.action === 'edited').a, String(T(400)));      // বদলের আগের মান
  assert.equal(h.find((r) => r.action === 'edited').who, 'রহিম');
  await ctx.user('outsider');
  assert.equal((await ctx.as('outsider', `select count(*)::int c from purchase_history`)).rows[0].c, 0);
});

test('২৫. পরীক্ষামূলক পুশ: ফিডে দেখা যায় না, একবারে এক মিনিটে একটি', async () => {
  const { ctx, gid, mem } = await make();
  await ctx.rpc('rahim', 'send_test_push', gid);
  await ctx.fails(ctx.rpc('rahim', 'send_test_push', gid), /একটু পরে/);
  assert.equal((await ctx.as('rahim', `select count(*)::int c from events where kind='push_test'`)).rows[0].c, 0);
  assert.equal((await ctx.admin(`select count(*)::int c from events where kind='push_test'`)).rows[0].c, 1);
});
