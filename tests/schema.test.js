import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newDb, Ctx, uuid, T, fourMembers } from './helpers.js';

const byName = (rep, name) => rep.members.find((m) => m.name === name);

test('২,০০০ টাকার উদাহরণ: রহিম করিমকে ২০০ টাকা দেবেন; পরিশোধ ও নিশ্চিতকরণ', async () => {
  const ctx = new Ctx(await newDb());
  const { gid, mem } = await fourMembers(ctx);
  await ctx.setToday('2026-11-10');
  for (const [n, amt, d] of [['rahim', 300, 'চাল'], ['karim', 700, 'ডাল'], ['abdul', 500, 'তেল'], ['salam', 500, 'মাছ']]) {
    await ctx.rpc(n, 'add_purchase', gid, uuid(), '2026-11-10', mem[n], d, T(amt), '[]');
  }
  let rep = await ctx.rpc('salam', 'month_report', gid, '2026-11-01');
  assert.equal(rep.total, T(2000));
  for (const m of rep.members) assert.equal(m.share, T(500));
  assert.equal(byName(rep, 'রহিম').balance, -T(200));
  assert.equal(byName(rep, 'করিম').balance, T(200));
  assert.equal(byName(rep, 'আব্দুল').balance, 0);
  assert.equal(byName(rep, 'সালাম').balance, 0);
  assert.deepEqual(rep.settlements.map((s) => [s.from_name, s.to_name, s.amount]), [['রহিম', 'করিম', T(200)]]);

  // পরিশোধ: নিশ্চিত না হওয়া পর্যন্ত হিসাব বদলায় না
  const pid = await ctx.rpc('rahim', 'add_payment', gid, uuid(), '2026-11-01', mem.karim, T(100), null);
  rep = await ctx.rpc('rahim', 'month_report', gid, '2026-11-01');
  assert.equal(byName(rep, 'রহিম').balance, -T(200));
  assert.equal(rep.pending_payments, 1);
  // অন্য কেউ (আব্দুল) বা দাতা নিজে নিশ্চিত করতে পারবেন না
  await ctx.fails(ctx.rpc('abdul', 'confirm_payment', pid), /প্রাপক|টাকা পাবেন/);
  await ctx.fails(ctx.rpc('rahim', 'confirm_payment', pid), /টাকা পাবেন/);
  await ctx.rpc('karim', 'confirm_payment', pid);
  rep = await ctx.rpc('rahim', 'month_report', gid, '2026-11-01');
  assert.equal(byName(rep, 'রহিম').balance, -T(100));
  assert.equal(byName(rep, 'করিম').balance, T(100));
  assert.equal(rep.settlements[0].amount, T(100));
  // একই পরিশোধ দ্বিতীয়বার নিশ্চিত করলে হিসাব বদলায় না
  await ctx.rpc('karim', 'confirm_payment', pid);
  rep = await ctx.rpc('rahim', 'month_report', gid, '2026-11-01');
  assert.equal(byName(rep, 'রহিম').balance, -T(100));
  const n = (await ctx.admin(`select count(*)::int c from events where kind='payment_confirmed'`)).rows[0].c;
  assert.equal(n, 1, 'দ্বিতীয় নিশ্চিতকরণে নতুন খবর যোগ হওয়া উচিত নয়');
  // ভারসাম্যের যোগফল শূন্য
  assert.equal(rep.members.reduce((s, m) => s + m.balance, 0), 0);
});

test('ফিডের বার্তা এক নজরে বোঝা যায়', async () => {
  const ctx = new Ctx(await newDb());
  const { gid, mem } = await fourMembers(ctx);
  await ctx.rpc('karim', 'add_purchase', gid, uuid(), '2026-11-01', mem.karim, 'চাল', T(700), '[]');
  const msgs = (await ctx.as('rahim', 'select message from events order by created_at, id')).rows.map((r) => r.message);
  assert.ok(msgs.includes('করিম ৭০০ টাকার চাল কিনেছেন।'), msgs.join(' | '));
});

test('একই বাটন দুবার চাপলেও বাজার একবারই যোগ হয়', async () => {
  const ctx = new Ctx(await newDb());
  const { gid, mem } = await fourMembers(ctx);
  const tok = uuid();
  const a = await ctx.rpc('karim', 'add_purchase', gid, tok, '2026-11-01', mem.karim, 'ডাল', T(100), '[]');
  const b = await ctx.rpc('karim', 'add_purchase', gid, tok, '2026-11-01', mem.karim, 'ডাল', T(100), '[]');
  assert.equal(a, b);
  assert.equal((await ctx.admin('select count(*)::int c from purchases')).rows[0].c, 1);
  const tok2 = uuid();
  const p1 = await ctx.rpc('rahim', 'add_payment', gid, tok2, '2026-11-01', mem.karim, T(10), null);
  const p2 = await ctx.rpc('rahim', 'add_payment', gid, tok2, '2026-11-01', mem.karim, T(10), null);
  assert.equal(p1, p2);
});

test('আইটেম যোগ করে মোট হয়; ভাগশেষ বণ্টনে যোগফল মোটের সমান', async () => {
  const ctx = new Ctx(await newDb());
  const { gid, mem } = await fourMembers(ctx);
  const items = JSON.stringify([{ name: 'চাল', amount: 33333 }, { name: 'ডাল', amount: 10001 }]);
  const pid = await ctx.rpc('abdul', 'add_purchase', gid, uuid(), '2026-11-01', mem.abdul, '', 0, items);
  const p = (await ctx.admin('select amount, description from purchases where id=$1', [pid])).rows[0];
  assert.equal(Number(p.amount), 43334);
  assert.equal(p.description, 'চাল, ডাল');
  // ৩ জন সক্রিয় (সালাম বিরতিতে) — ১০০১ পয়সা ৩ জনে
  await ctx.setToday('2026-11-05');
  await ctx.rpc('salam', 'set_pause', gid, '2026-11-05', null);
  for (let d = 5; d < 9; d++) {
    await ctx.setToday(`2026-11-0${d}`);
    const id = await ctx.rpc('rahim', 'add_purchase', gid, uuid(), `2026-11-0${d}`, mem.rahim, 'সবজি', 1001, '[]');
    const sh = (await ctx.admin('select share::int s from purchase_shares where purchase_id=$1', [id])).rows.map((r) => r.s).sort();
    assert.equal(sh.length, 3);
    assert.equal(sh.reduce((a, b) => a + b, 0), 1001);
    assert.ok(Math.max(...sh) - Math.min(...sh) <= 1);
  }
});

test('বিরতির প্রথম দিন ভাগ বন্ধ, ফেরার দিন থেকে আবার শুরু', async () => {
  const ctx = new Ctx(await newDb());
  const { gid, mem } = await fourMembers(ctx);
  await ctx.setToday('2026-11-20');
  // সালাম ১০ নভেম্বর থেকে বিরতি, ১৫ নভেম্বর ফেরা
  await ctx.rpc('salam', 'set_pause', gid, '2026-11-10', '2026-11-15');
  const shareOf = async (date) => {
    const id = await ctx.rpc('rahim', 'add_purchase', gid, uuid(), date, mem.rahim, 'বাজার ' + date, T(400), '[]');
    return (await ctx.admin('select member_id, share::int s from purchase_shares where purchase_id=$1', [id])).rows
      .find((r) => r.member_id === mem.salam);
  };
  assert.equal((await shareOf('2026-11-09')).s, T(100), 'বিরতির আগের দিন ভাগ আছে');
  assert.equal(await shareOf('2026-11-10'), undefined, 'বিরতির প্রথম দিন ভাগ নেই');
  assert.equal(await shareOf('2026-11-14'), undefined, 'বিরতির শেষ দিন ভাগ নেই');
  assert.equal((await shareOf('2026-11-15')).s, T(100), 'ফেরার দিন ভাগ আছে');
  assert.equal((await shareOf('2026-11-16')).s, T(100));
});

test('নতুন সদস্যের যোগদানের আগের বাজার তাঁর নামে যায় না; চলে গেলে পরের বাজারে ভাগ নেই', async () => {
  const ctx = new Ctx(await newDb());
  const { gid, mem } = await fourMembers(ctx);
  await ctx.setToday('2026-11-12');
  const early = await ctx.rpc('rahim', 'add_purchase', gid, uuid(), '2026-11-11', mem.rahim, 'আগের বাজার', T(400), '[]');
  await ctx.user('nila');
  const code = await ctx.rpc('rahim', 'create_member_invitation', gid, 'nila@x.test');
  await ctx.rpc('nila', 'join_group', code, 'নীলা');
  const nilaId = (await ctx.admin(`select id from members where display_name='নীলা'`)).rows[0].id;
  const later = await ctx.rpc('rahim', 'add_purchase', gid, uuid(), '2026-11-12', mem.rahim, 'পরের বাজার', T(500), '[]');
  const has = async (pid) => (await ctx.admin('select 1 from purchase_shares where purchase_id=$1 and member_id=$2', [pid, nilaId])).rows.length > 0;
  assert.equal(await has(early), false);
  assert.equal(await has(later), true);
  // আগের বাজারের মাঝে যোগদান: আগের বাজারের হিসাব বদলায়নি
  assert.equal((await ctx.admin('select count(*)::int c from purchase_shares where purchase_id=$1', [early])).rows[0].c, 4);

  // নীলা গ্রুপ ছাড়লেন (আজ ১২ তারিখ): আজকের বাজার পর্যন্ত ভাগ, ১৩ তারিখ থেকে নয়
  await ctx.rpc('nila', 'leave_group', gid);
  await ctx.setToday('2026-11-13');
  const next = await ctx.rpc('rahim', 'add_purchase', gid, uuid(), '2026-11-13', mem.rahim, 'পরদিন', T(500), '[]');
  assert.equal(await has(next), false);
  assert.equal(await has(later), true, 'পুরোনো বাজারে ভাগ থেকে যায়');
  // তিনি আর বাজার লিখতে পারবেন না, কিন্তু রিপোর্ট দেখতে পারবেন
  await ctx.fails(ctx.rpc('nila', 'add_purchase', gid, uuid(), '2026-11-13', nilaId, 'x', 100, '[]'), /সক্রিয় সদস্য নন/);
  const rep = await ctx.rpc('nila', 'month_report', gid, '2026-11-01');
  assert.ok(rep.members.find((m) => m.name === 'নীলা'));
});

test('মাসের শেষ দিনের বাজার পরের মাসে: সরাসরি নয়, সংশোধন-অনুরোধ → অ্যাডমিন অনুমোদন; দ্বিতীয় দিনের পরে নয়', async () => {
  const ctx = new Ctx(await newDb());
  const { gid, mem } = await fourMembers(ctx);
  await ctx.setToday('2026-12-01');
  await ctx.fails(ctx.rpc('karim', 'add_purchase', gid, uuid(), '2026-11-30', mem.karim, 'রাতের বাজার', T(400), '[]'), /সংশোধনের অনুরোধ/);
  const cid = await ctx.rpc('karim', 'request_correction', gid, uuid(), '2026-11-01', 'add', null, '2026-11-30', mem.karim, 'রাতের বাজার', T(400), '[]', 'ভুলে বাদ পড়েছিল');
  // অ্যাডমিন দেখেন: তারিখ, টাকা, কার ভাগ বদলাবে
  const list = await ctx.rpc('rahim', 'list_corrections', gid, '2026-11-01');
  assert.equal(list.length, 1);
  assert.equal(list[0].amount, T(400));
  assert.equal(list[0].date, '2026-11-30');
  assert.equal(list[0].new_shares.length, 4);
  assert.equal(list[0].new_shares.reduce((s, x) => s + x.share, 0), T(400));
  // সদস্য নিজে অনুমোদন করতে পারেন না
  await ctx.fails(ctx.rpc('karim', 'resolve_correction', cid, true, null), /অ্যাডমিন/);
  await ctx.rpc('rahim', 'resolve_correction', cid, true, 'ঠিক আছে');
  const rep = await ctx.rpc('abdul', 'month_report', gid, '2026-11-01');
  assert.equal(rep.total, T(400));
  assert.equal(byName(rep, 'করিম').balance, T(300));
  // আরেকটি অনুরোধ ২ তারিখেও চলে, ৩ তারিখে নয়
  await ctx.setToday('2026-12-02');
  await ctx.rpc('karim', 'request_correction', gid, uuid(), '2026-11-01', 'add', null, '2026-11-29', mem.karim, 'আরও', T(100), '[]', null);
  await ctx.setToday('2026-12-03');
  await ctx.fails(ctx.rpc('karim', 'request_correction', gid, uuid(), '2026-11-01', 'add', null, '2026-11-29', mem.karim, 'দেরি', T(100), '[]', null), /প্রথম দুই দিন/);
});

test('চূড়ান্ত করা: শুধু অ্যাডমিন; অমীমাংসিত থাকলে সতর্কতা; চূড়ান্ত হিসাব বদলানো যায় না; নতুন মাস শূন্য থেকে', async () => {
  const ctx = new Ctx(await newDb());
  const { gid, mem } = await fourMembers(ctx);
  await ctx.setToday('2026-11-10');
  for (const [n, amt] of [['rahim', 300], ['karim', 700], ['abdul', 500], ['salam', 500]]) {
    await ctx.rpc(n, 'add_purchase', gid, uuid(), '2026-11-10', mem[n], 'বাজার', T(amt), '[]');
  }
  const pay = await ctx.rpc('rahim', 'add_payment', gid, uuid(), '2026-11-01', mem.karim, T(100), null);
  // মাস শেষ হওয়ার আগে নয়
  await ctx.fails(ctx.rpc('rahim', 'finalize_month', gid, '2026-11-01', false), /মাস শেষ হওয়ার আগে/);
  await ctx.setToday('2026-12-03');
  await ctx.fails(ctx.rpc('karim', 'finalize_month', gid, '2026-11-01', false), /শুধু অ্যাডমিন/);
  const w = await ctx.rpc('rahim', 'finalize_month', gid, '2026-11-01', false);
  assert.equal(w.ok, false);
  assert.equal(w.pending_payments, 1);
  const ok = await ctx.rpc('rahim', 'finalize_month', gid, '2026-11-01', true);
  assert.equal(ok.ok, true);
  const rep = await ctx.rpc('karim', 'month_report', gid, '2026-11-01');
  assert.equal(rep.status, 'finalized');
  assert.equal(byName(rep, 'রহিম').balance, -T(200), 'অনিশ্চিত পরিশোধ হিসাবে নেই');
  assert.equal(rep.pending_payments, 1, 'রিপোর্টে অনিশ্চিত পরিশোধ দেখানো থাকে');

  // বদলানোর সব চেষ্টা ব্যর্থ: RPC
  await ctx.fails(ctx.rpc('karim', 'confirm_payment', pay), /নিশ্চিত করা যাবে না|চূড়ান্ত/);
  await ctx.fails(ctx.rpc('rahim', 'add_payment', gid, uuid(), '2026-11-01', mem.karim, T(50), null), /চূড়ান্ত/);
  await ctx.fails(ctx.rpc('rahim', 'finalize_month', gid, '2026-11-01', true), /আগেই চূড়ান্ত/);
  // সরাসরি ডেটাবেসে (এমনকি মালিক হিসেবেও) বদলানো যায় না — ট্রিগার
  await ctx.fails(ctx.admin(`update purchases set amount = 1 where bazar_date = '2026-11-10'`), /চূড়ান্ত/);
  await ctx.fails(ctx.admin(`delete from purchases where bazar_date = '2026-11-10'`), /চূড়ান্ত/);
  await ctx.fails(ctx.admin(`update purchase_shares set share = 1`), /চূড়ান্ত/);
  await ctx.fails(ctx.admin(`insert into payments(group_id, month, from_id, to_id, amount, client_token, status)
     values ('${gid}', '2026-11-01', '${mem.rahim}', '${mem.karim}', 5, gen_random_uuid(), 'confirmed')`), /চূড়ান্ত/);
  await ctx.fails(ctx.admin(`update months set report = '{}'::jsonb`), /চূড়ান্ত রিপোর্ট/);
  await ctx.fails(ctx.admin(`delete from months`), /মুছে ফেলা যাবে না/);
  // ক্লায়েন্ট (authenticated) সরাসরি লিখতেও পারে না
  await ctx.fails(ctx.as('karim', `update purchases set amount = 1`), /permission denied/);
  await ctx.fails(ctx.as('karim', `insert into months(group_id, month, report) values ('${gid}','2026-10-01','{}')`), /permission denied/);

  // সদস্য চলে গেলে বা অ্যাকাউন্ট মুছলে নভেম্বরের চূড়ান্ত রিপোর্ট একই থাকে
  const before = JSON.stringify(await ctx.rpc('rahim', 'month_report', gid, '2026-11-01'));
  await ctx.rpc('salam', 'delete_my_account');
  const after = JSON.stringify(await ctx.rpc('rahim', 'month_report', gid, '2026-11-01'));
  assert.equal(after, before);
  assert.ok((await ctx.admin(`select 1 from members where display_name='সালাম' and user_id is null`)).rows.length === 1);
  assert.equal((await ctx.admin(`select count(*)::int c from auth.users where id=$1`, [ctx.users.salam])).rows[0].c, 0);

  // নতুন মাস শূন্য থেকে; আগের মাসের বাকি আগের রিপোর্টেই; ডিসেম্বরে দেনা মিটেছে বলে দেখায় না
  await ctx.setToday('2026-12-05');
  const dec = await ctx.rpc('rahim', 'month_report', gid, '2026-12-01');
  assert.equal(dec.total, 0);
  assert.equal(dec.settlements.length, 0);
  assert.equal(dec.members.every((m) => m.balance === 0 && m.share === 0), true);
  const nov = await ctx.rpc('rahim', 'month_report', gid, '2026-11-01');
  assert.equal(nov.settlements[0].amount, T(200));
  const months = await ctx.rpc('rahim', 'group_months', gid);
  assert.deepEqual(months.map((m) => [m.month, m.finalized]), [['2026-12-01', false], ['2026-11-01', true]]);
});

test('অনুমতি: বাইরের কেউ অন্য গ্রুপের তথ্য দেখতে বা বদলাতে পারে না (RLS ও RPC)', async () => {
  const ctx = new Ctx(await newDb());
  const { gid, mem } = await fourMembers(ctx);
  await ctx.setToday('2026-11-10');
  const pid = await ctx.rpc('rahim', 'add_purchase', gid, uuid(), '2026-11-10', mem.rahim, 'চাল', T(300), '[]');
  await ctx.user('outsider');
  for (const t of ['groups', 'members', 'purchases', 'purchase_items', 'purchase_shares', 'payments', 'events', 'corrections', 'months', 'pauses']) {
    const r = await ctx.as('outsider', `select count(*)::int c from ${t}`);
    assert.equal(r.rows[0].c, 0, `${t} বাইরের লোকের কাছে দৃশ্যমান`);
  }
  const mine = await ctx.as('rahim', 'select count(*)::int c from purchases');
  assert.equal(mine.rows[0].c, 1);
  await ctx.fails(ctx.rpc('outsider', 'month_report', gid, '2026-11-01'), /অনুমতি নেই/);
  await ctx.fails(ctx.rpc('outsider', 'add_purchase', gid, uuid(), '2026-11-10', mem.rahim, 'চুরি', 100, '[]'), /সক্রিয় সদস্য নন/);
  await ctx.fails(ctx.rpc('outsider', 'update_purchase', pid, '2026-11-10', mem.rahim, 'x', 1, '[]'), /সক্রিয় সদস্য নন/);
  await ctx.fails(ctx.rpc('outsider', 'delete_purchase', pid), /সক্রিয় সদস্য নন/);
  await ctx.fails(ctx.rpc('outsider', 'finalize_month', gid, '2026-11-01', true), /শুধু অ্যাডমিন/);
  await ctx.fails(ctx.rpc('outsider', 'delete_group', gid), /শুধু অ্যাডমিন/);
  await ctx.fails(ctx.rpc('karim', 'delete_group', gid), /শুধু অ্যাডমিন/);
  await ctx.fails(ctx.rpc('karim', 'create_member_invitation', gid, 'other@x.test'), /শুধু অ্যাডমিন/);
  await ctx.fails(ctx.as('outsider', `insert into purchases(group_id,bazar_date,buyer_id,description,amount,created_by,client_token) values ('${gid}','2026-11-10','${mem.rahim}','x',1,'${mem.rahim}',gen_random_uuid())`), /permission denied/);
  await ctx.fails(ctx.as('outsider', `select * from push_subscriptions`), /permission denied/);
  // anon শুধু গ্রুপের নাম দেখতে পারে, অন্য কিছু নয়
  await ctx.db.exec(`reset role; set role anon;`);
  await ctx.fails(ctx.db.query('select * from groups'), /permission denied/);
  await ctx.fails(ctx.db.query(`select public.month_report('${gid}', '2026-11-01')`), /permission denied/);
  const nm = await ctx.db.query(`select public.group_name_by_code((select invite_code from groups limit 1)) as n`).catch((e) => e);
  // (anon-এর groups-এ SELECT নেই বলে উপরের সাব-কুয়েরি ব্যর্থ — কোড হাতে দিয়ে আলাদা পরীক্ষা)
  await ctx.db.exec('reset role');
  const code = await ctx.rpc('rahim', 'create_member_invitation', gid, 'newbie@x.test');
  await ctx.db.exec('reset role; set role anon');
  assert.equal((await ctx.db.query(`select public.group_name_by_code('${code}') as n`)).rows[0].n, 'বাসা');
  await ctx.db.exec('reset role');
  // নিজের বাজারই সংশোধন করা যায়; অন্যেরটা নয়
  await ctx.fails(ctx.rpc('karim', 'update_purchase', pid, '2026-11-10', mem.rahim, 'বদল', T(1), '[]'), /নিজের লেখা/);
  await ctx.fails(ctx.rpc('karim', 'delete_purchase', pid), /নিজের লেখা/);
  await ctx.rpc('rahim', 'update_purchase', pid, '2026-11-10', mem.rahim, 'চাল (সংশোধিত)', T(350), '[]');
  assert.equal((await ctx.rpc('karim', 'month_report', gid, '2026-11-01')).total, T(350));
  await ctx.rpc('rahim', 'delete_purchase', pid);
  assert.equal((await ctx.rpc('karim', 'month_report', gid, '2026-11-01')).total, 0);
});

test('গ্রুপ ও অ্যাকাউন্ট ব্যবস্থাপনা: একমাত্র অ্যাডমিন ছাড়তে পারেন না; দায়িত্ব হস্তান্তর; গ্রুপ মোছা', async () => {
  const ctx = new Ctx(await newDb());
  const { gid, mem } = await fourMembers(ctx);
  await ctx.fails(ctx.rpc('rahim', 'leave_group', gid), /একমাত্র অ্যাডমিন/);
  await ctx.fails(ctx.rpc('rahim', 'delete_my_account'), /একমাত্র অ্যাডমিন/);
  await ctx.rpc('rahim', 'transfer_admin', gid, mem.karim);
  await ctx.rpc('rahim', 'leave_group', gid);
  assert.equal((await ctx.admin(`select role from members where id=$1`, [mem.karim])).rows[0].role, 'admin');
  await ctx.fails(ctx.rpc('rahim', 'finalize_month', gid, '2026-11-01', true), /শুধু অ্যাডমিন/);
  await ctx.rpc('karim', 'delete_group', gid);
  assert.equal((await ctx.admin('select count(*)::int c from groups')).rows[0].c, 0);
  assert.equal((await ctx.admin('select count(*)::int c from members')).rows[0].c, 0);
  // একমাত্র সদস্য হিসেবে অ্যাকাউন্ট মুছলে গ্রুপও যায়
  await ctx.user('solo');
  const g2 = await ctx.rpc('solo', 'create_group', 'একা', 'BDT', '৳', 'টাকা', 'টাকার', 2, 'একা');
  await ctx.fails(ctx.rpc('solo', 'leave_group', g2), /একমাত্র সদস্য/);
  await ctx.rpc('solo', 'delete_my_account');
  assert.equal((await ctx.admin('select count(*)::int c from groups')).rows[0].c, 0);
});

test('নতুন সদস্য আমন্ত্রণের কোডে সরাসরি সঠিক গ্রুপে যোগ দেন; ভুল কোড ব্যর্থ', async () => {
  const ctx = new Ctx(await newDb());
  const { gid } = await fourMembers(ctx);
  const code = await ctx.rpc('rahim', 'create_member_invitation', gid, 'NEWBIE@x.test');
  await ctx.fails(ctx.rpc('karim', 'join_group', code, 'করিম'), /অন্য ইমেইল/);
  await ctx.fails(ctx.as('karim', 'select code from private.member_invitations'), /permission denied/);
  await ctx.fails(ctx.as('karim', "select private.join_group('unused','নাম')"), /permission denied/);
  await ctx.user('newbie');
  await ctx.fails(ctx.rpc('newbie', 'join_group', 'WRONG123', 'নতুন'), /ঠিক নয়/);
  const j = await ctx.rpc('newbie', 'join_group', code.toLowerCase(), 'নতুন');
  assert.equal(j, gid);
  assert.equal(await ctx.rpc('newbie', 'join_group', code, 'নতুন'), gid, 'দ্বিতীয়বার যোগ দিলে নতুন সদস্য তৈরি হয় না');
  assert.equal((await ctx.admin('select count(*)::int c from members where group_id=$1', [gid])).rows[0].c, 5);
  const names = (await ctx.as('newbie', 'select display_name from members')).rows.length;
  assert.equal(names, 5);
});
