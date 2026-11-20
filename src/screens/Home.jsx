import React from 'react';
import { useStore } from '../store.jsx';
import { Header, Balance, Avatar, Empty } from './parts.jsx';
import { fmtMoney, dayLabel } from '../lib/format.js';
import { go } from '../App.jsx';
import { rpc } from '../lib/supabase.js';
import { Btn, useAction } from '../ui.jsx';

export default function Home() {
  const s = useStore(); const g = s.group; const rep = s.data.report;
  const my = s.myRow;
  const incoming = (rep.payments || []).filter((p) => p.status === 'pending' && p.to === s.me?.id);
  const recent = s.data.purchases.slice(0, 5);
  const nameOf = (id) => s.data.members.find((m) => m.id === id)?.display_name || '';
  const [busy, run] = useAction();
  const confirm = (id) => run(async () => { await rpc('confirm_payment', { p_id: id }); await s.reloadGroup(); }, 'নিশ্চিত করা হয়েছে।');

  return (
    <>
      <Header />
      <div className="hero" style={{ marginTop: 6 }}>
        <div className="lbl">এ মাসে মোট বাজার</div>
        <div className="big">{fmtMoney(rep.total, g)}</div>
        <div className="split">
          <div className="mini"><div className="lbl">আপনার ভাগ</div><div className="v">{fmtMoney(my?.share ?? 0, g)}</div></div>
          <div className="mini"><div className="lbl">আপনার বাকি</div><div className="v"><Balance value={my?.balance ?? 0} g={g} /></div></div>
        </div>
      </div>

      <div className="home-actions" aria-label="খাতার কাজ">
        {s.isActive && <a className="btn" href="#/add">+ বাজার লিখুন</a>}
        <a className="btn secondary" href="#/report">মাসিক হিসাব</a>
      </div>
      {s.isAdmin && s.data.members.filter(member => !member.left_on).length === 1 &&
        <div className="card stack"><h2>সদস্য আমন্ত্রণ করুন</h2><p>সদস্যের নামে একটি লিংক তৈরি করে পাঠান। তিনি ইমেইল ছাড়াই যোগ দিতে পারবেন।</p><a href="#/members">আমন্ত্রণ লিংক তৈরি করুন →</a></div>}

      {incoming.map((p) => (
        <div className="banner" key={p.id}>
          <b>{p.from_name}</b> আপনাকে <b>{fmtMoney(p.amount, g)}</b> দিয়েছেন বলে জানিয়েছেন। টাকা পেয়ে থাকলে নিশ্চিত করুন।
          <div className="btn-row"><Btn busy={busy} className="small" onClick={() => confirm(p.id)}>হ্যাঁ, পেয়েছি</Btn>
            <button className="btn small secondary" onClick={() => go('#/report')}>রিপোর্টে দেখুন</button></div>
        </div>
      ))}

      <div className="section">
        <div className="row between"><h2>সাম্প্রতিক বাজার</h2>{recent.length ? <a href="#/list" className="small">সব দেখুন</a> : null}</div>
        <div className="card">
          {recent.length === 0 ? (
            <Empty title="এ মাসে এখনও কোনো বাজার নেই">{s.isActive ? <p className="small">“বাজার লিখুন” থেকে প্রথম খরচটি যোগ করুন।</p> : null}</Empty>
          ) : recent.map((p) => (
            <div className="item row" key={p.id}>
              <Avatar name={nameOf(p.buyer_id)} id={p.buyer_id} />
              <div className="grow"><div className="t break">{p.description}</div><div className="small muted">{nameOf(p.buyer_id)} · {dayLabel(p.bazar_date)}</div></div>
              <div className="amt">{fmtMoney(p.amount, g)}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
