// চুক্তি-পরীক্ষা: অ্যাপ যে RPC/টেবিল/কলাম ডাকে, ডেটাবেসে সেগুলো সত্যিই আছে।
// (ডেমো-মক ভুল পথ দেখাতে পারে; এটি আসল স্কিমার সঙ্গে কোড মেলায়।)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { newDb } from './helpers.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const src = walk(join(root, 'src')).filter((f) => /\.jsx?$/.test(f)).map((f) => readFileSync(f, 'utf8')).join('\n');

test('অ্যাপের প্রতিটি rpc(...) ফাংশন ডেটাবেসে আছে', async () => {
  const names = [...new Set([...src.matchAll(/\brpc(?:Queued)?\(\s*'([a-z_]+)'/g)].map((m) => m[1]))];
  assert.ok(names.length > 20, 'RPC নাম খুঁজে পাওয়া যায়নি');
  const db = await newDb(true);
  const have = new Set((await db.query(`select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'`)).rows.map((r) => r.proname));
  const missing = names.filter((n) => !have.has(n));
  assert.deepEqual(missing, [], 'ডেটাবেসে নেই: ' + missing.join(', '));
});

test('অ্যাপ যে টেবিল সরাসরি পড়ে সেগুলো আছে এবং authenticated পড়তে পারে', async () => {
  const tables = [...new Set([...src.matchAll(/supabase\.from\('([a-z_]+)'\)/g)].map((m) => m[1]))];
  const db = await newDb(true);
  for (const t of tables) {
    const r = await db.query(`select has_table_privilege('authenticated', 'public.${t}', 'select') ok`);
    assert.equal(r.rows[0].ok, true, `${t}: authenticated পড়তে পারে না`);
  }
});

test('anon শুধু অনুমোদিত দুটি ফাংশন চালাতে পারে', async () => {
  const db = await newDb(true);
  const rows = (await db.query(`select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and has_function_privilege('anon', p.oid, 'execute') order by 1`)).rows.map((r) => r.proname);
  assert.deepEqual(rows, ['group_name_by_code', 'preview_access_link']);
});

test('গোপন private টেবিল authenticated/anon পড়তে পারে না', async () => {
  const db = await newDb(true);
  const rows = (await db.query(`select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='private' and c.relkind='r' and (has_table_privilege('authenticated', c.oid, 'select') or has_table_privilege('anon', c.oid, 'select'))`)).rows;
  assert.deepEqual(rows, []);
});
