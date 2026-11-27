import { t, useLanguage } from '../lib/language.js';
import React from 'react';
import { useStore } from '../store.jsx';
import { fmtMoney, monthLabel, addMonths, monthOf, todayDhaka, balanceText, dayLabel } from '../lib/format.js';
import { Tag, useAction } from '../ui.jsx';
import { go } from '../App.jsx';

const COLORS = ['#2f7a50', '#b0652a', '#4a6fa5', '#8a4f8f', '#a8483d', '#3d8a8a', '#7a7a2f', '#6b5b95'];
export function Avatar({ name = '?', id = '', sm }) {
  let h = 0; for (const c of String(id || name)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return <span className={`avatar ${sm ? 'sm' : ''}`} style={{ background: COLORS[h % COLORS.length] }} aria-hidden="true">{Array.from(name.trim())[0] || '?'}</span>;
}

export function Icon({ name }) {
  const P = {
    home: <><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /><path d="M10 20v-6h4v6" /></>,
    basket: <><path d="M4 9h16l-1.5 10a2 2 0 0 1-2 1.7H7.5a2 2 0 0 1-2-1.7L4 9z" /><path d="M8 9l3-5M16 9l-3-5" /></>,
    report: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h3" /></>,
    bell: <><path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15L6 17z" /><path d="M10 21h4" /></>,
    users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.7a3.5 3.5 0 0 1 0 6.6M18 14a6 6 0 0 1 3.5 6" /></>,
    gear: <><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    cart: <><circle cx="9" cy="20" r="1.5" /><circle cx="18" cy="20" r="1.5" /><path d="M3 4h2.5l2 11h11l2-8H7" /></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{P[name]}</svg>;
}

export function Empty({ icon = 'cart', title, children }) {
  return <div className="empty"><div className="ic"><Icon name={icon} /></div><b>{title}</b>{children}</div>;
}

export function Skeleton() {
  return <div className="app no-nav" style={{ paddingTop: 20 }}>
    <div className="sk" style={{ height: 34, width: '55%' }} /><div className="sk" style={{ height: 44, marginTop: 14 }} />
    <div className="sk" style={{ height: 170, marginTop: 16, borderRadius: 24 }} />
    <div className="sk" style={{ height: 56, marginTop: 14 }} /><div className="sk" style={{ height: 90, marginTop: 14 }} />
  </div>;
}

export function LanguagePicker(){
  const {language,setLanguage}=useLanguage();
  const [busy,run]=useAction();
  return <div className="language-picker" aria-label="Language / ভাষা">
    <button type="button" disabled={busy} aria-pressed={language===t("en")} onClick={()=>run(()=>setLanguage(t("en")))}>EN</button>
    <button type="button" disabled={busy} aria-pressed={language==='bn'} onClick={()=>run(()=>setLanguage('bn'))}>বাংলা</button>
  </div>;
}

export function Header({ title }) {
  const s = useStore();
  const ms = s.data.months.map(m => m.month);
  const cm = monthOf(todayDhaka());
  const finalized = s.data.report.status === 'finalized';
  const newest = ms[0] && ms[0] > cm ? ms[0] : cm;
  const oldest = ms[ms.length - 1] || cm;
  return (
    <header className="topbar">
      <div className="eyebrow">{title || t("বাজারের খাতা")}</div>
      <div className="khai-masthead">
        <h1 className="khai-wordmark">MessMate</h1>
        {s.memberships.length <= 1 && <span className="khai-groupname">{s.group.name}</span>}
      </div>
      {s.memberships.length > 1 && <div className="khai-group-picker">
        <select aria-label={t("গ্রুপ বদলান")} value={s.gid} onChange={e => {s.setGid(e.target.value); go('#/');}}>
          {s.memberships.map(m => <option key={m.group_id} value={m.group_id}>{m.groups.name}</option>)}
        </select>
      </div>}
      <LanguagePicker />
      <div className="monthbar">
        <button type="button" className="nb" aria-label={t("আগের মাস")} disabled={s.month <= oldest} onClick={() => s.setMonth(addMonths(s.month, -1))}>‹</button>
        <div className="lbl">{monthLabel(s.month)} {finalized ? <Tag>{t("চূড়ান্ত")}</Tag> : <Tag kind="amber">{t("খসড়া")}</Tag>}</div>
        <button type="button" className="nb" aria-label={t("পরের মাস")} disabled={s.month >= newest} onClick={() => s.setMonth(addMonths(s.month, 1))}>›</button>
      </div>
      {s.me?.left_on && <div className="banner">{t("আপনি এই গ্রুপ ছেড়েছেন। আগের হিসাব দেখা ও বাকি টাকা মেটানো যাবে।")}</div>}
    </header>
  );
}

export function Balance({ value, g }) {
  const cls = value > 0 ? 'pos' : value < 0 ? 'neg' : 'zero';
  return <span className={cls}>{value === 0 ? t("মিটেছে ✓") : `${fmtMoney(Math.abs(value), g)} ${balanceText(value)}`}</span>;
}
