import React, { useState } from 'react';
import { useStore } from '../store.jsx';
import { Header, Balance, Avatar, Empty } from './parts.jsx';
import { fmtMoney, dayLabel, todayDhaka, monthOf } from '../lib/format.js';
import { PaySheet } from './Report.jsx';
import { Tour, LastMonthOpenBanner } from './Banners.jsx';
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
  const [paySheet, setPaySheet] = useState(null);
  const canPay = rep.status !== 'finalized' && s.month <= monthOf(todayDhaka()) && !!s.me && s.isActive;
  const iOwe = canPay ? (rep.settlements || []).filter((x) => x.from === s.me.id) : [];
  const owedToMe = (rep.settlements || []).filter((x) => x.to === s.me?.id);
  const outgoing = (rep.payments || []).filter((p) => p.status === 'pending' && p.from === s.me?.id);
  const recently = (id) => { const t = s.data.paymentMeta?.[id]?.reminded_at; return !!t && Date.now() - new Date(t).getTime() < 864e5; };
  const remind = (p) => run(async () => { await rpc('remind_payment', { p_id: p.id }); await s.reloadGroup(); }, `${p.to_name}-কে মনে করানো হয়েছে।`);
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

      <Tour />
      <LastMonthOpenBanner />
      <div className="home-actions" aria-label="খাতার কাজ">
        {s.isActive && <a className="btn" href="#/add">+ বাজার লিখুন</a>}
        <a className="btn secondary" href="#/report">মাসিক হিসাব</a>
      </div>
      {s.isAdmin && s.data.members.filter(member => !member.left_on).length === 1 &&
        <div className="card stack"><h2>সদস্য আমন্ত্রণ করুন</h2><p>সদস্যের নামে একটি লিংক তৈরি করে পাঠান। তিনি ইমেইল ছাড়াই যোগ দিতে পারবেন।</p><a href="#/members">আমন্ত্রণ লিংক তৈরি করুন →</a></div>}

      {iOwe.length > 0 && <div className="card stack">
        <h2>আপনাকে দিতে হবে</h2>
        {iOwe.map((x) => (
          <div className="row between" key={x.to}>
            <div className="grow break"><b>{x.to_name}</b>কে <b className="neg">{fmtMoney(x.amount, g)}</b></div>
            <button className="btn small" onClick={() => setPaySheet({ to: x.to, amount: x.amount })}>দিয়েছি, লিখুন</button>
          </div>))}
      </div>}
      {owedToMe.length > 0 && <div className="card stack">
        <h2>আপনি পাবেন</h2>
        {owedToMe.map((x) => <div key={x.from}><b>{x.from_name}</b> দেবেন <b className="pos">{fmtMoney(x.amount, g)}</b></div>)}
      </div>}
      {outgoing.map((p) => (
        <div className="banner" key={p.id}>
          আপনার লেখা <b>{fmtMoney(p.amount, g)}</b> পরিশোধ <b>{p.to_name}</b>-এর নিশ্চিতের অপেক্ষায় আছে।
          <div className="btn-row">{recently(p.id)
            ? <span className="small muted">আজ মনে করানো হয়েছে ✓</span>
            : <Btn busy={busy} className="small secondary" onClick={() => remind(p)}>মনে করিয়ে দিন</Btn>}</div>
        </div>
      ))}

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
      {paySheet ? <PaySheet init={paySheet} onClose={() => setPaySheet(null)} /> : null}
    </>
  );
}
