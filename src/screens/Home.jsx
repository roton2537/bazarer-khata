import { t } from '../lib/language.js';
import React, { useState } from 'react';
import { useStore } from '../store.jsx';
import { Header, Balance, Avatar, Empty } from './parts.jsx';
import { fmtMoney, dayLabel, todayDhaka, monthOf, toBnDigits } from '../lib/format.js';
import { PaySheet } from './Report.jsx';
import { go } from '../App.jsx';
import { rpc } from '../lib/supabase.js';
import { Btn, useAction } from '../ui.jsx';

export default function Home() {
  const s = useStore(); const g = s.group; const rep = s.data.report;
  const my = s.myRow;
  const incoming = (rep.payments || []).filter(p => p.status === 'pending' && p.to === s.me?.id);
  const outgoing = (rep.payments || []).filter(p => p.status === 'pending' && p.from === s.me?.id);
  const owedToMe = (rep.settlements || []).filter(x => x.to === s.me?.id);
  const iOwe = (rep.settlements || []).filter(x => x.from === s.me?.id);
  const recently = id => { const t = s.data.paymentMeta?.[id]?.reminded_at; return !!t && Date.now() - new Date(t).getTime() < 864e5; };
  const [busy, run] = useAction();
  const [paySheet, setPaySheet] = useState(null);
  const canPay = rep.status !== 'finalized' && s.month <= monthOf(todayDhaka()) && !!s.me && s.isActive;
  const nameOf = id => s.data.members.find(m => m.id === id)?.display_name || '';
  const recent = s.data.purchases.slice(0, 4);
  // Progress describes the member's share of *this month's purchases*, not the money settled.
  const sharePercent = rep.total > 0 ? Math.max(0, Math.min(100, Math.round(100 * (my?.share || 0) / rep.total))) : 0;
  const remind = p => run(async () => { await rpc('remind_payment', { p_id: p.id }); await s.reloadGroup(); }, `${p.to_name}-কে মনে করানো হয়েছে।`);
  const confirm = id => run(async () => { await rpc('confirm_payment', { p_id: id }); await s.reloadGroup(); }, t("নিশ্চিত করা হয়েছে।"));

  return (
    <div className="khai-home">
      <Header />
      <section className="hero khai-hero" aria-label={t("মাসের হিসাব")}>
        <div className="lbl">{t("এ মাসে মোট বাজার")}</div>
        <div className="big">{fmtMoney(rep.total, g)}</div>
        <div className="split">
          <div className="mini"><span className="lbl">{t("আপনার ভাগ")}</span><strong className="v">{fmtMoney(my?.share ?? 0, g)}</strong></div>
          <div className="mini"><span className="lbl">{t("আপনার বাকি")}</span><strong className="v"><Balance value={my?.balance ?? 0} g={g} /></strong></div>
        </div>
        <div className="khai-progress-caption"><span>{t("মোট বাজারে আপনার অংশ")}</span><b>{toBnDigits(sharePercent)}%</b></div>
        <div className="khai-progress" role="progressbar" aria-label={t("মোট বাজারে আপনার অংশ")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={sharePercent}><i style={{width: sharePercent + '%'}} /></div>
      </section>

      <div className="home-actions" aria-label={t("খাতার কাজ")}>
        {s.isActive && rep.status !== 'finalized' && s.month === monthOf(todayDhaka()) && <a className="btn" href="#/add">{t("+ বাজার লিখুন")}</a>}
        <a className="btn secondary" href="#/report">{t("মাসিক হিসাব")}</a>
      </div>
      {s.isAdmin && s.data.members.filter(member => !member.left_on).length === 1 &&
        <section className="card stack khai-card"><h2>{t("সদস্য আমন্ত্রণ করুন")}</h2><p>{t("লিংক পাঠিয়ে ইমেইল অ্যাকাউন্ট ছাড়াই সদস্য যোগ করুন।")}</p><a href="#/members">{t("আমন্ত্রণ লিংক তৈরি করুন →")}</a></section>}

      {(owedToMe.length > 0 || iOwe.length > 0 || rep.total > 0) && (
        <section className="card khai-card" aria-label={t("এই মাসের দেনা পাওনা")}>
          <div className="khai-section-head"><h2>{t("দেনা–পাওনা")}</h2><a href="#/report">{t("বিস্তারিত দেখুন")}</a></div>
          {owedToMe.length > 0 && <h3 className="khai-subheading">{t("আপনি পাবেন")}</h3>}
          {owedToMe.map(x => <div className="khai-due" key={'in-'+x.from}>
            <Avatar name={x.from_name} id={x.from} />
            <div className="grow"><b>{x.from_name}</b><div className="small muted">{t("আপনাকে দেবেন")}</div></div>
            <strong className="khai-due-value">{fmtMoney(x.amount, g)}</strong>
          </div>)}
          {iOwe.length > 0 && <h3 className="khai-subheading">{t("আপনাকে দিতে হবে")}</h3>}
          {iOwe.map(x => <div className="khai-due" key={'out-'+x.to}>
            <Avatar name={x.to_name} id={x.to} />
            <div className="grow"><b>{x.to_name}</b><div className="small muted">{t("আপনি দেবেন")}</div></div>
            <strong className="khai-due-value">{fmtMoney(x.amount, g)}</strong>
            {canPay && <button className="khai-paid-btn" onClick={() => setPaySheet({to:x.to,amount:x.amount})}>{t("দিয়েছি")}</button>}
          </div>)}
          {!owedToMe.length && !iOwe.length && <p className="muted" style={{padding: '8px 0'}}>{t("এই মাসের দেনা–পাওনা মিটেছে ✓")}</p>}
          <p className="small muted khai-hint">{t("পরিশোধ হিসাব থেকে কমবে প্রাপক নিশ্চিত করার পর।")}</p>
        </section>
      )}

      {outgoing.map(p => <div className="banner" key={p.id}>{t("\n        আপনার লেখা ")}<b>{fmtMoney(p.amount, g)}</b>{t(" পরিশোধ ")}<b>{p.to_name}</b>{t("-এর নিশ্চিতের অপেক্ষায় আছে।\n        ")}<div className="btn-row">{recently(p.id) ? <span className="small muted">{t("আজ মনে করানো হয়েছে ✓")}</span>
          : <Btn busy={busy} className="small secondary" onClick={() => remind(p)}>{t("মনে করিয়ে দিন")}</Btn>}</div>
      </div>)}
      {incoming.map(p => <div className="banner" key={p.id}>
        <b>{p.from_name}</b>{t(" আপনাকে ")}<b>{fmtMoney(p.amount, g)}</b>{t(" দিয়েছেন বলে জানিয়েছেন। টাকা পেলে নিশ্চিত করুন।\n        ")}<div className="btn-row"><Btn busy={busy} className="small" onClick={() => confirm(p.id)}>{t("হ্যাঁ, পেয়েছি")}</Btn>
          <button className="btn small secondary" onClick={() => go('#/report')}>{t("রিপোর্টে দেখুন")}</button></div>
      </div>)}

      <section className="card khai-card" aria-label={t("কে কত বাজার করেছেন")}>
        <div className="khai-section-head"><h2>{t("কে কত বাজার করেছেন")}</h2><span className="small muted">{t("এই মাস")}</span></div>
        {rep.members.length === 0 ? <Empty title={t("এখনও কোনো হিসাব নেই")} /> : rep.members.map(m => {
          const percent = rep.total > 0 ? Math.max(0, Math.min(100, Math.round(m.purchased / rep.total * 100))) : 0;
          return <div className="khai-spender" key={m.id}>
            <div className="khai-spender-row">
              <span className="grow"><b>{m.name}</b>{m.id === s.me?.id ? <span className="small muted">{t(" (আমি)")}</span> : null}</span>
              <span className="small muted">{fmtMoney(m.purchased, g)}{t(" · ভাগ ")}{fmtMoney(m.share, g)}</span>
            </div>
            <div className="khai-bar" role="meter" aria-label={m.name + t(" এর বাজার")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><i style={{width:percent + '%'}} /></div>
          </div>;
        })}
      </section>

      <section className="card khai-card" aria-label={t("সাম্প্রতিক বাজার")}>
        <div className="khai-section-head"><h2>{t("সাম্প্রতিক বাজার")}</h2><a href="#/list">{t("সব দেখুন")}</a></div>
        {recent.length === 0 ? <Empty title={t("এ মাসে এখনও কোনো বাজার নেই")}>{s.isActive && rep.status !== 'finalized' && s.month === monthOf(todayDhaka()) && <p className="small">{t("প্রথম বাজারটি লিখে শুরু করুন।")}</p>}</Empty>
          : recent.map(p => <div className="khai-due" key={p.id}>
            <Avatar name={nameOf(p.buyer_id)} id={p.buyer_id} />
            <div className="grow"><b className="break">{p.description}</b><div className="small muted">{nameOf(p.buyer_id)} · {dayLabel(p.bazar_date)}</div></div>
            <strong className="khai-due-value">{fmtMoney(p.amount, g)}</strong>
          </div>)}
      </section>
      {paySheet && <PaySheet init={paySheet} onClose={() => setPaySheet(null)} />}
    </div>
  );
}
