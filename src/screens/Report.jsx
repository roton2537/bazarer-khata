import { t, language } from '../lib/language.js';
import ProductReport from './ProductReport.jsx';
import React, { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store.jsx';
import { Header, Balance, Avatar, Empty } from './parts.jsx';
import { fmtMoney, parseMoney, minorToInput, monthLabel, dateLabel, dayLabel, todayDhaka, monthOf, addMonths, correctionWindowOpen, newToken } from '../lib/format.js';
import { Btn, Field, Sheet, Tag, useAction, useConfirm, useToast } from '../ui.jsx';
import { rpc } from '../lib/supabase.js';

const PAY_STATUS = { pending: ['amber', 'নিশ্চিতের অপেক্ষায়'], confirmed: ['', 'নিশ্চিত'], rejected: ['red', 'প্রাপক পাননি বলেছেন'], cancelled: ['gray', 'বাতিল'], expired: ['gray', 'অনিশ্চিত থেকে গেছে'] };
const KIND = { add: 'নতুন বাজার যোগ', edit: 'বাজার সংশোধন', delete: 'বাজার মোছা' };

export default function Report() {
  const s = useStore(); const g = s.group; const rep = s.data.report; const toast = useToast();
  const finalized = rep.status === 'finalized';
  const outstanding = (rep.settlements || []).reduce((sum, settlement) => sum + settlement.amount, 0);
  const today = todayDhaka();
  const canPay = !finalized && s.month <= monthOf(today) && !!s.me;
  const [paySheet, setPaySheet] = useState(null);
  const [selectedDate, setSelectedDate] = useState(s.month === monthOf(today) ? today : s.month);
  const [ask, confirmNode] = useConfirm();
  const [busy, run] = useAction();
  const meId = s.me?.id;
  const reload = () => s.reloadGroup();
  const [adjSheet, setAdjSheet] = useState(false);
  useEffect(() => {
    const expanded = new Set();
    const prepare = () => {
      for (const detail of document.querySelectorAll('details.fold:not([open])')) {
        expanded.add(detail);
        detail.open = true;
      }
    };
    const restore = () => {
      for (const detail of expanded) detail.open = false;
      expanded.clear();
    };
    window.addEventListener('beforeprint', prepare);
    window.addEventListener('afterprint', restore);
    return () => {
      window.removeEventListener('beforeprint', prepare);
      window.removeEventListener('afterprint', restore);
    };
  }, []);
  const shareSummary = async () => {
    const lines = [`${g.name} — ${monthLabel(s.month)}${finalized ? '' : t(" (খসড়া)")}`, `মোট বাজার: ${fmtMoney(rep.total, g)}`,
      ...(rep.settlements.length ? [t("কে কাকে কত দেবেন:"), ...rep.settlements.map((x) => `• ${x.from_name} → ${x.to_name}: ${fmtMoney(x.amount, g)}`)] : [t("সবার হিসাব মিটেছে ✓")])];
    const text = lines.join('\n');
    try { if (navigator.share) await navigator.share({ title: g.name, text }); else { await navigator.clipboard.writeText(text); toast(t("সারাংশ কপি হয়েছে।")); } }
    catch (e) { if (e?.name !== 'AbortError') toast(t("শেয়ার করা যায়নি।"), true); }
  };
  const meta = (id) => s.data.paymentMeta?.[id] || {};

  const payAct = (fn, id, msg) => run(async () => { await rpc(fn, { p_id: id }); await reload(); }, msg);
  const pendingCorr = s.data.corrections.filter((c) => c.status === 'pending');
  const doneCorr = s.data.corrections.filter((c) => c.status !== 'pending');

  const closeDate = async () => {
    if (!await ask({title: dayLabel(selectedDate) + ' তারিখের বাজার বন্ধ করবেন?', body:t("এই দিনের খরচ ও ভাগ সংরক্ষিত থাকবে। একই সদস্যরা অন্য তারিখে বাজার লিখতে পারবেন।"), confirmText:t("তারিখ বন্ধ করুন")})) return;
    run(async () => { await rpc('close_ledger_date', {p_group:s.gid,p_date:selectedDate}); await reload(); }, t("তারিখ বন্ধ হয়েছে।"));
  };
  const printName = `${s.group.name} — ${monthLabel(s.month)} ${finalized ? t("(চূড়ান্ত)") : t("(খসড়া)")}`;

  return (
    <>
      <Header title={t("মাসিক রিপোর্ট")} />
      <ProductReport />
      <div className="card khai-report-summary" style={{ marginTop: 12 }}>
        <div className="row between"><h2 className="break">{printName}</h2></div>
        <div className="row between" style={{ marginTop: 6 }}><span className="muted">{t("মোট বাজার")}</span><b style={{ fontSize: 22 }}>{fmtMoney(rep.total, g)}</b></div>
        <div className="khai-outstanding"><div>{t("এখনো বাকি: ")}{fmtMoney(outstanding, g)}</div><div className="small muted">{outstanding ? t("পরিশোধ প্রাপক নিশ্চিত করলে অবশিষ্ট হিসাব কমবে।") : t("সব হিসাব মিটেছে ✓")}</div></div>
        {finalized ? <p className="small muted">{t("চূড়ান্ত করেছেন ")}{rep.finalized_by_name || t("অ্যাডমিন")} · {dateLabel(new Date(rep.finalized_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' }))}</p>
          : <p className="small muted">{t("এই মাসের মোট হিসাবে খোলা ও বন্ধ তারিখের বাজার রয়েছে।")}</p>}
        <div className="btn-row noprint">
          <button className="btn small secondary" onClick={shareSummary}>{t("সারাংশ শেয়ার করুন")}</button>
          <button className="btn small secondary" onClick={() => window.print()}>{t("PDF / প্রিন্ট")}</button>
        </div>
      </div>

      <div className="section">
        <h2>{t("কে কাকে কত দেবেন")}</h2>
        <div className="card" style={{ marginTop: 8 }}>
          {rep.settlements.length === 0 ? <Empty icon="report" title={rep.members.length && rep.total ? t("সবার হিসাব মিটেছে ✓") : t("এখনও কোনো দেনা-পাওনা নেই")} /> : rep.settlements.map((x, i) => (
            <div className="item" key={i}>
              <div className="pay-line"><Avatar sm name={x.from_name} id={x.from} /><span className="arrow">→</span><Avatar sm name={x.to_name} id={x.to} /><div className="grow break">{x.from === s.me?.id ? <b>{t("আপনি")}</b> : <b>{x.from_name}</b>} {x.to === s.me?.id ? <b>{t("আপনাকে")}</b> : <><b>{x.to_name}</b>কে</>} <b className="neg">{fmtMoney(x.amount, g)}</b> {x.from === s.me?.id ? t("দেবেন") : t("দেবেন")}।</div></div>
              {canPay && x.from === meId ? <div className="btn-row"><button className="btn small" onClick={() => setPaySheet({ to: x.to, amount: x.amount })}>{t("পরিশোধ লিখুন")}</button></div> : null}
            </div>
          ))}
        </div>
        {canPay ? <div style={{ marginTop: 10 }}><button className="btn secondary" onClick={() => setPaySheet({})}>{t("+ অন্য পরিশোধ লিখুন")}</button></div> : null}
      </div>

      <details className="section fold">
        <summary><h2>{t("কে কত বাজার করেছেন, কার ভাগ কত")}</h2><span className="small muted">{t("খুলুন / বন্ধ করুন")}</span></summary>
        {rep.members.length === 0 ? <div className="card"><Empty icon="report" title={t("এখনও কোনো হিসাব নেই")} /></div> : rep.members.map((m) => (
          <div className="card" key={m.id} style={{ marginTop: 8 }}>
            <div className="row"><Avatar name={m.name} id={m.id} /><b className="break grow">{m.name}{m.id === meId ? t(" (আমি)") : ''}</b><Balance value={m.balance} g={g} /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 14px', marginTop: 8, fontSize: 14 }}>
              <span className="muted">{t("বাজার")}</span><span className="muted">{t("ভাগ")}</span>
              <b>{fmtMoney(m.purchased, g)}</b><b>{fmtMoney(m.share, g)}</b>
              {m.sent || m.received ? <><span className="muted" style={{ marginTop: 4 }}>{t("পরিশোধ দিয়েছেন")}</span><span className="muted" style={{ marginTop: 4 }}>{t("পেয়েছেন")}</span>
                <b>{fmtMoney(m.sent, g)}</b><b>{fmtMoney(m.received, g)}</b></> : null}
            </div>
          </div>
        ))}
      </details>

      {rep.payments.length > 0 ? (
        <div className="section">
          <h2>{t("পরিশোধের তালিকা")}</h2>
          <div className="card" style={{ marginTop: 8 }}>
            {rep.payments.map((p) => {
              const [kind, label] = PAY_STATUS[p.status] || ['gray', p.status];
              return (
                <div className="item" key={p.id}>
                  <div className="row between" style={{ alignItems: 'flex-start' }}>
                    <div className="grow break"><b>{p.from_name}</b> → <b>{p.to_name}</b>{meta(p.id).kind === 'adjustment' ? <> <Tag kind="amber">{t("সমন্বয়")}</Tag></> : null}{meta(p.id).kind === 'adjustment' ? <div className="small">{meta(p.id).note}</div> : null}<div className="small muted">{dayLabel(new Date(p.created_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' }))}</div></div>
                    <div style={{ textAlign: 'right' }}><div className="amt">{fmtMoney(p.amount, g)}</div><Tag kind={kind}>{t(label)}</Tag></div>
                  </div>
                  {p.status === 'pending' && p.to === meId && !finalized ? (
                    <div className="btn-row"><Btn busy={busy} className="small" onClick={() => payAct('confirm_payment', p.id, t("নিশ্চিত করা হয়েছে।"))}>{t("হ্যাঁ, পেয়েছি")}</Btn>
                      <Btn busy={busy} className="small danger secondary" onClick={() => payAct('reject_payment', p.id, t("জানানো হয়েছে।"))}>{t("পাইনি")}</Btn></div>) : null}
                  {p.status === 'pending' && p.from === meId && !finalized ? (
                    <div className="btn-row"><Btn busy={busy} className="small" onClick={() => payAct('remind_payment', p.id, `${p.to_name}-কে মনে করানো হয়েছে।`)}>{t("মনে করিয়ে দিন")}</Btn>
                      <Btn busy={busy} className="small secondary" onClick={() => payAct('cancel_payment', p.id, t("বাতিল করা হয়েছে।"))}>{t("লেখাটি বাতিল করুন")}</Btn></div>) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {!finalized && (pendingCorr.length > 0 || doneCorr.length > 0) ? (
        <div className="section">
          <h2>{t("সংশোধনের অনুরোধ")}</h2>
          {[...pendingCorr, ...doneCorr].map((c) => <CorrectionCard key={c.id} c={c} g={g} />)}
        </div>
      ) : null}

      {finalized && rep.pending_payments > 0 ? <div className="banner" style={{ marginTop: 16 }}>এই মাস চূড়ান্ত হওয়ার সময় {rep.pending_payments}টি পরিশোধ নিশ্চিত হয়নি। সেগুলো হিসাবে ধরা হয়নি।</div> : null}

      {s.isAdmin && !finalized && s.month === monthOf(today) ? <div className="section noprint">
        <h2>{t("সমন্বয় ভুক্তি")}</h2>
        <p className="small muted">{t("চূড়ান্ত হয়ে যাওয়া আগের মাসের ভুল সরাসরি বদলানো যায় না। এখানে চলতি মাসে একটি নিশ্চিত সমন্বয় যোগ করে দুজনের হিসাব শুধরে নিন।")}</p>
        <button className="btn secondary" disabled={s.data.members.filter(m => !m.left_on).length < 2} onClick={() => setAdjSheet(true)}>{t("+ সমন্বয় যোগ করুন")}</button>
      </div> : null}

      <section className="section card stack">
        {s.isAdmin && !finalized && <form className="stack" onSubmit={e => {e.preventDefault(); closeDate();}}>
          <Field label={t("বাজার বন্ধের তারিখ")}><input type="date" required min={s.month} max={s.month === monthOf(today) ? today : new Date(Date.parse(addMonths(s.month,1))-86400000).toISOString().slice(0,10)} value={selectedDate} onChange={e => setSelectedDate(e.target.value)} /></Field>
          <Btn busy={busy} disabled={s.data.closures.some(d => d.ledger_date === selectedDate)}>{t("এই তারিখ বন্ধ করুন")}</Btn>
        </form>}
        {s.data.closures.map(d => <details key={d.ledger_date}><summary>{dayLabel(d.ledger_date)}{t(" · বন্ধ · ")}{fmtMoney(d.report.total,g)}</summary>
          {d.report.purchases.map(p => <div className="item" key={p.id}><b>{p.description} · {fmtMoney(p.amount,g)}</b><div>{p.buyer}</div>{(p.shares || []).map((x,i) => <small key={i}>{x.member} · {fmtMoney(x.share,g)} </small>)}</div>)}
        </details>)}
      </section>

      {paySheet ? <PaySheet init={paySheet} onClose={() => setPaySheet(null)} /> : null}
      {adjSheet ? <AdjustSheet onClose={() => setAdjSheet(false)} /> : null}
      {confirmNode}
    </>
  );
}

function CorrectionCard({ c, g }) {
  const [kind, label] = c.status === 'pending' ? ['amber', t("অপেক্ষায়")] : c.status === 'approved' ? ['', t("অনুমোদিত")] : ['red', t("বাতিল")];
  return (
    <div className="card" style={{ marginTop: 8 }}>
      <div className="row between"><b>{t(KIND[c.kind])}</b><Tag kind={kind}>{t(label)}</Tag></div>
      <p className="small muted">{t("অনুরোধ করেছেন ")}{c.requested_by_name}{c.reason ? ` · কারণ: ${c.reason}` : ''}</p>
      {c.kind !== 'delete' ? (
        <div className="kv"><span className="k">{t("তারিখ")}</span><span>{c.date ? dayLabel(c.date) : ''}</span><span className="k">{t("কী")}</span><span className="break">{c.description}</span><span className="k">{t("ক্রেতা")}</span><span>{c.buyer_name}</span><span className="k">{t("টাকা")}</span><b>{fmtMoney(c.amount, g)}</b></div>) : null}
      {c.old ? <div className="small muted" style={{ marginTop: 6 }}>{c.kind === 'delete' ? t("যে বাজার মুছবে") : t("আগে ছিল")}: {dayLabel(c.old.date)} · {c.old.description} · {fmtMoney(c.old.amount, g)}</div> : null}
      {c.status === 'pending' ? (
        <>
          <div className="small muted" style={{ marginTop: 8 }}>{c.kind === 'delete' ? t("এই সদস্যদের ভাগ কমবে:") : t("নতুন ভাগ:")}</div>
          <div className="shares">{(c.kind === 'delete' ? c.old?.shares || [] : c.new_shares).map((x) => <React.Fragment key={x.member_id}><span>{x.name}</span><span>{fmtMoney(x.share, g)}</span></React.Fragment>)}</div>
          {c.kind === 'edit' && c.old ? <div className="small muted" style={{ marginTop: 6 }}>{t("আগের ভাগ: ")}{c.old.shares.map((x) => `${x.name} ${fmtMoney(x.share, g)}`).join(', ')}</div> : null}
        </>
      ) : null}
    </div>
  );
}

export function PaySheet({ init, onClose }) {
  const s = useStore(); const g = s.group; const dec = g.currency_decimals;
  const others = s.data.members.filter((m) => m.id !== s.me.id && m.user_id);
  const [to, setTo] = useState(init.to || others[0]?.id || '');
  const [amt, setAmt] = useState(init.amount ? minorToInput(init.amount, dec) : '');
  const [busy, run] = useAction(); const toast = useToast();
  const token = useMemo(() => newToken(), []);
  const submit = (e) => {
    e.preventDefault();
    const a = parseMoney(amt, dec);
    if (!to) return toast(t("কাকে দিয়েছেন বেছে নিন।"), true);
    if (!a || a <= 0) return toast(t("পরিশোধের টাকা লিখুন।"), true);
    run(async () => {
      await rpc('add_payment', { p_group: s.gid, p_token: token, p_month: s.month, p_to: to, p_amount: a, p_note: null });
      toast(t("পরিশোধ লেখা হয়েছে। প্রাপক নিশ্চিত করলে হিসাবে যোগ হবে।"));
      await s.reloadGroup();
      onClose();
    });
  };
  return (
    <Sheet title={t("পরিশোধ লিখুন")} onClose={onClose}>
      <form onSubmit={submit}>
        <div className={`banner ${s.month < monthOf(todayDhaka()) ? '' : 'green'}`}>এই পরিশোধ <b>{monthLabel(s.month)}</b>-এর হিসাবে যাবে।{s.month < monthOf(todayDhaka()) ? ' (আগের মাস। মাস বদলাতে উপরের তীর ব্যবহার করুন।)' : ''}</div>
        <Field label={t("কাকে দিয়েছেন")}><select value={to} onChange={(e) => setTo(e.target.value)}>{others.map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}</select></Field>
        <Field label={language()==='en' ? 'Amount ('+g.currency_code+')' : `কত ${g.currency_name}`}><input type="text" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} autoFocus /></Field>
        <p className="small muted">{t("প্রাপকের কাছে নিশ্চিত করার অনুরোধ যাবে। তিনি নিশ্চিত করার পরই আপনার বাকি কমবে।")}</p>
        <div className="btn-row"><button type="button" className="btn secondary" onClick={onClose}>{t("থাক")}</button><Btn busy={busy} type="submit">{t("লিখে রাখুন")}</Btn></div>
      </form>
    </Sheet>
  );
}

function AdjustSheet({ onClose }) {
  const s = useStore(); const g = s.group; const dec = g.currency_decimals;
  const members = s.data.members.filter((m) => !m.left_on);
  const [from, setFrom] = useState(members[0]?.id || ''); const [to, setTo] = useState(members[1]?.id || '');
  const [amt, setAmt] = useState(''); const [why, setWhy] = useState('');
  const [busy, run] = useAction(); const toast = useToast();
  const token = useMemo(() => newToken(), []);
  const submit = (e) => {
    e.preventDefault();
    const a = parseMoney(amt, dec);
    if (!from || !to || from === to) return toast(t("দুজন আলাদা সদস্য বেছে নিন।"), true);
    if (!a || a <= 0) return toast(t("টাকার পরিমাণ লিখুন।"), true);
    if (!why.trim()) return toast(t("কারণ লিখুন।"), true);
    run(async () => { await rpc('add_adjustment', { p_group: s.gid, p_token: token, p_from: from, p_to: to, p_amount: a, p_reason: why.trim() }); await s.reloadGroup(); onClose(); }, t("সমন্বয় যোগ হয়েছে।"));
  };
  const name = (id) => members.find((m) => m.id === id)?.display_name || '';
  return (
    <Sheet title={t("সমন্বয় যোগ করুন")} onClose={onClose}>
      <form onSubmit={submit}>
        <p className="small muted">“{name(from)}-এর কাছ থেকে {name(to)}-কে” মানে: {name(from)}-এর দেনা কমবে, {name(to)}-এর পাওনা কমবে। এটি সবার খবরে দেখা যাবে।</p>
        <Field label={t("যাঁর দেনা কমবে")}><select value={from} onChange={(e) => setFrom(e.target.value)}>{members.map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}</select></Field>
        <Field label={t("যাঁর পাওনা কমবে")}><select value={to} onChange={(e) => setTo(e.target.value)}>{members.map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}</select></Field>
        <Field label={language()==='en' ? 'Amount ('+g.currency_code+')' : `কত ${g.currency_name}`}><input inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} /></Field>
        <Field label={t("কারণ (সবাই দেখবে)")}><input maxLength={200} placeholder={t("যেমন: নভেম্বরে চাল দুবার ধরা পড়েছিল")} value={why} onChange={(e) => setWhy(e.target.value)} /></Field>
        <div className="btn-row"><button type="button" className="btn secondary" onClick={onClose}>{t("থাক")}</button><Btn busy={busy} type="submit">{t("যোগ করুন")}</Btn></div>
      </form>
    </Sheet>
  );
}
