import test from 'node:test';
import assert from 'node:assert/strict';
import { newDb, Ctx, fourMembers, uuid } from './helpers.js';

test('buyers own their purchases and only email admins can issue one-use member invitations', async () => {
  const db = await newDb(true);
  try {
    const ctx = new Ctx(db);
    const { gid, mem } = await fourMembers(ctx);
    await ctx.admin('reset role');
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
    const locked = await add('karim',mem.karim);
    await assert.rejects(ctx.rpc('karim','close_ledger_date',gid,date));
    await ctx.rpc('rahim','close_ledger_date',gid,date);
    await assert.rejects(ctx.rpc('karim','delete_purchase',locked));
    await assert.rejects(add('karim',mem.karim));
    await ctx.setToday('2026-11-02');
    await ctx.rpc('karim','add_purchase',gid,uuid(),'2026-11-02',mem.karim,'Milk',200,'[]');
    const reports = await ctx.as('karim','select report from public.closed_dates');
    assert.equal(reports.rows[0].report.total,500);
    await assert.rejects(ctx.rpc('rahim','finalize_month',gid,date,false));
  } finally { await db.close(); }
});
