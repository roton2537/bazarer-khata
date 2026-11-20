import { newDb } from '../../tests/helpers.js';
import { writeFileSync } from 'node:fs';
const db = await newDb();
const fn = (await db.query(`select p.proname n from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' order by 1`)).rows.map(r=>r.n);
const tb = (await db.query(`select table_name n from information_schema.tables where table_schema in ('public','private') and table_type='BASE TABLE' order by 1`)).rows.map(r=>r.n);
const pubTb = (await db.query(`select table_name n from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1`)).rows.map(r=>r.n);
const cols = (await db.query(`select table_schema||'.'||table_name||'.'||column_name n from information_schema.columns where table_schema in ('public','private') order by 1`)).rows.map(r=>r.n);
const pol = (await db.query(`select tablename||'.'||policyname n from pg_policies where schemaname='public' order by 1`)).rows.map(r=>r.n);
const arr=(a)=>"array['"+a.join("','")+"']";
const sql = `-- স্কিমা-যাচাই: প্রোডাকশন ডেটাবেস ০০০১–০০০৭ মাইগ্রেশনের ফল কি না।
-- Supabase → SQL Editor-এ পুরোটা চালান। ফলাফলে কোনো সারি "নেই" বা "বাড়তি" দেখালে সেটি মেলেনি।
-- (এই ফাইল স্বয়ংক্রিয়ভাবে তৈরি: node supabase/tools/gen_verify.mjs)
with want as (
  select 'ফাংশন' kind, unnest(${arr(fn)}) name
  union all select 'টেবিল', unnest(${arr(tb.map((t)=>t))})
  union all select 'কলাম', unnest(${arr(cols)})
  union all select 'পলিসি', unnest(${arr(pol)})
), have as (
  select 'ফাংশন' kind, p.proname name from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public'
  union all select 'টেবিল', table_name from information_schema.tables where table_schema in ('public','private') and table_type='BASE TABLE'
  union all select 'কলাম', table_schema||'.'||table_name||'.'||column_name from information_schema.columns where table_schema in ('public','private')
  union all select 'পলিসি', tablename||'.'||policyname from pg_policies where schemaname='public'
)
select 'নেই' status, w.kind, w.name from want w left join have h using (kind, name) where h.name is null and w.kind <> 'টেবিল'
union all
select 'নেই', w.kind, w.name from want w left join have h using (kind, name) where h.name is null and w.kind = 'টেবিল' and w.name not in ('users')
union all
select 'বাড়তি (public ফাংশন/পলিসি)', h.kind, h.name from have h left join want w using (kind, name) where w.name is null and h.kind in ('ফাংশন','পলিসি')
order by 1, 2, 3;
-- ফাঁকা ফল = স্কিমা মিলেছে।

-- নিরাপত্তা-যাচাই (প্রতিটির ফল ফাঁকা হতে হবে)
-- ১) anon শুধু দুটি ফাংশন চালাতে পারবে:
select p.proname as "anon-এর বাড়তি অনুমতি" from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and has_function_privilege('anon', p.oid, 'execute') and p.proname not in ('group_name_by_code','preview_access_link');
-- ২) private টেবিল কেউ সরাসরি পড়তে পারবে না:
select c.relname as "পড়া যায় এমন private টেবিল" from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='private' and c.relkind='r' and (has_table_privilege('authenticated', c.oid, 'select') or has_table_privilege('anon', c.oid, 'select'));
-- ৩) RLS বন্ধ এমন public টেবিল:
select c.relname as "RLS বন্ধ" from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind='r' and not c.relrowsecurity;
`;
writeFileSync(new URL('./verify_schema.sql', import.meta.url), sql);
console.log(fn.length, tb.length, cols.length, pol.length);
