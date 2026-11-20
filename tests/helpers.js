// SQL পরীক্ষার সহায়ক: PGlite (সত্যিকারের Postgres) + Supabase-এর auth/role এর অনুকরণ
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = readFileSync(join(here, '../supabase/migrations/0001_bazar_khata.sql'), 'utf8');

export async function newDb() {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    grant usage on schema public to anon, authenticated;
    create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
  `);
  await db.exec(MIGRATION);
  await db.exec(readFileSync(join(here, '../supabase/migrations/0002_admin_invitations.sql'), 'utf8'));
  await db.exec(readFileSync(join(here, '../supabase/migrations/0003_phone_access.sql'), 'utf8'));
  await db.exec(readFileSync(join(here, '../supabase/migrations/0004_admin_account.sql'), 'utf8'));
  return db;
}

export class Ctx {
  constructor(db) { this.db = db; this.users = {}; }
  async setToday(d) {
    await this.db.exec(`reset role; create or replace function private.today() returns date language sql stable as $$ select '${d}'::date $$;`);
  }
  async user(name) {
    await this.db.exec('reset role;');
    const r = await this.db.query(`insert into auth.users(email, raw_user_meta_data) values ($1, $2) returning id`,
      [`${name}@x.test`, JSON.stringify({ name })]);
    this.users[name] = r.rows[0].id;
    return r.rows[0].id;
  }
  // নির্দিষ্ট ব্যবহারকারী হিসেবে (authenticated role) চালানো
  async as(name, sql, params = []) {
    await this.db.exec(`reset role; select set_config('request.jwt.claim.sub', '${this.users[name]}', false); set role authenticated;`);
    return this.db.query(sql, params);
  }
  async rpc(name, fn, ...args) {
    const ph = args.map((_, i) => `$${i + 1}`).join(', ');
    const r = await this.as(name, `select public.${fn}(${ph}) as v`, args);
    return r.rows[0].v;
  }
  async admin(sql, params = []) { await this.db.exec('reset role;'); return this.db.query(sql, params); }
  async fails(p, re) {
    let err = null;
    try { await p; } catch (e) { err = e; }
    if (!err) throw new Error('ব্যর্থ হওয়ার কথা ছিল, কিন্তু হয়নি');
    if (re && !re.test(err.message)) throw new Error(`ভুল ত্রুটি: ${err.message}`);
    return err;
  }
}

export const uuid = () => crypto.randomUUID();
export const T = (taka) => Math.round(taka * 100); // টাকা → পয়সা

// চার জনের গ্রুপ (সবাই ১ নভেম্বর যোগ দিয়েছেন)
export async function fourMembers(ctx, today = '2026-11-01') {
  await ctx.setToday(today);
  for (const n of ['rahim', 'karim', 'abdul', 'salam']) await ctx.user(n);
  const gid = await ctx.rpc('rahim', 'create_group', 'বাসা', 'BDT', '৳', 'টাকা', 'টাকার', 2, 'রহিম');
  for (const [n, bn] of [['karim', 'করিম'], ['abdul', 'আব্দুল'], ['salam', 'সালাম']]) {
    const code = await ctx.rpc('rahim', 'create_member_invitation', gid, n + '@x.test');
    await ctx.rpc(n, 'join_group', code, bn);
  }
  const mem = {};
  for (const r of (await ctx.admin('select id, display_name, user_id from members where group_id=$1', [gid])).rows) {
    const name = Object.keys(ctx.users).find((k) => ctx.users[k] === r.user_id);
    mem[name] = r.id;
  }
  return { gid, mem };
}
