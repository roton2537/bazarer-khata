import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newDb, Ctx, fourMembers, uuid } from './helpers.js';

test('buyers own their purchases and only email admins can issue one-use member invitations', async () => {
  const db = await newDb();
  try {
    const ctx = new Ctx(db);
    const { gid, mem } = await fourMembers(ctx);
    await ctx.admin('reset role');
    await db.exec(readFileSync(new URL('../supabase/migrations/0009_owner_purchases.sql', import.meta.url), 'utf8'));
    const date = '2026-11-01';
    const add = (user, buyer) => ctx.rpc(user, 'add_purchase', gid, uuid(), date, buyer, 'Rice', 500, '[]');
    await assert.rejects(add('rahim', mem.karim));
    const purchase = await add('karim', mem.karim);
    await assert.rejects(ctx.rpc('rahim','update_purchase', purchase, date, mem.rahim, 'Rice', 900, '[]'));
    await assert.rejects(ctx.rpc('rahim','delete_purchase', purchase));
    await ctx.rpc('karim','update_purchase', purchase, date, mem.karim, 'Rice', 900, '[]');
    await ctx.rpc('karim','delete_purchase', purchase);
    await assert.rejects(ctx.rpc('karim','issue_access_link',gid,'New',null));
    await assert.rejects(ctx.rpc('rahim','issue_access_link',gid,'Restore',mem.karim));
    const token = await ctx.rpc('rahim','issue_access_link',gid,'New',null);
    await ctx.user('first'); await ctx.user('second');
    assert.equal(await ctx.rpc('first','accept_access_link',token,'First'),gid);
    await assert.rejects(ctx.rpc('second','accept_access_link',token,'Second'));
    assert.equal((await ctx.rpc('rahim','finalize_month',gid,date,false)).ok,true);
    await assert.rejects(add('karim',mem.karim));
  } finally { await db.close(); }
});
