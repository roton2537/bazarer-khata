import React, { useMemo, useState } from 'react';
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
  const today = todayDhaka();
  const monthEnded = today >= addMonths(s.month, 1);
  const canPay = !finalized && s.month <= monthOf(today) && !!s.me;
  const [paySheet, setPaySheet] = useState(null);
  const [corrSheet, setCorrSheet] = useState(false);
  const [finSheet, setFinSheet] = useState(null);
  const [ask, confirmNode] = useConfirm();
  const [busy, run] = useAction();
  const meId = s.me?.id;
  const reload = () => s.reloadGroup();

  const payAct = (fn, id, msg) => run(async () => { await rpc(fn, { p_id: id }); await reload(); }, msg);
  const pendingCorr = s.data.corrections.filter((c) => c.status === 'pending');
  const doneCorr = s.data.corrections.filter((c) => c.status !== 'pending');

  const resolve = async (c, approve) => {
    const ok = await ask({ title: approve ? 'অনুরোধ অনুমোদন করবেন?' : 'অনুরোধ বাতিল করবেন?',
      body: approve ? `${c.requested_by_name}-এর “${KIND[c.kind]}” অনুরোধটি হিসাবে যুক্ত হবে এবং সংশ্লিষ্ট সদস্যদের ভাগ বদলাবে।` : 'অনুরোধটি বাতিল হবে, হিসাব আগের মতোই থাকবে।',
      confirmText: approve ? 'অনুমোদন করুন' : 'বাতিল করুন', danger: !approve });
    if (ok) run(async () => { await rpc('resolve_correction', { p_id: c.id, p_approve: approve, p_note: null }); await reload(); }, approve ? 'অনুমোদিত হয়েছে।' : 'বাতিল করা হয়েছে।');
  };

  const startFinalize = async () => {
    const ok = await ask({ title: `${monthLabel(s.month)} মাসের হিসাব চূড়ান্ত করবেন?`,
      body: 'চূড়ান্ত করলে এই মাসের কোনো বাজার, ভাগ বা পরিশোধ আর বদলানো যাবে না। যাঁদের টাকা বাকি আছে, তা এই মাসের রিপোর্টেই বাকি দেখাবে। নতুন মাসের হিসাব শূন্য থেকে শুরু হবে।',
      confirmText: 'এগিয়ে যান' });
    if (!ok) return;
    run(async () => {
      const r = await rpc('finalize_month', { p_group: s.gid, p_month: s.month, p_force: false });
      if (!r.ok) setFinSheet(r); else { await reload(); toast('হিসাব চূড়ান্ত হয়েছে।'); }
    });
  };
  const forceFinalize = () => run(async () => {
    await rpc('finalize_month', { p_group: s.gid, p_month: s.month, p_force: true });
    setFinSheet(null); await reload();
  }, 'হিসাব চূড়ান্ত হয়েছে।');

  const printName = `${s.group.name} — ${monthLabel(s.month)} ${finalized ? '(চূড়ান্ত)' : '(খসড়া)'}`;

  return (
    <>
      <Header title="মাসিক রিপোর্ট" />
      <div className="card" style={{ marginTop: 12 }}>
        <div className="row between"><h2 className="break">{printName}</h2></div>
        <div className="row between" style={{ marginTop: 6 }}><span className="muted">মোট বাজার</span><b style={{ fontSize: 22 }}>{fmtMoney(rep.total, g)}</b></div>
        {finalized ? <p className="small muted">চূড়ান্ত করেছেন {rep.finalized_by_name || 'অ্যাডমিন'} · {dateLabel(new Date(rep.finalized_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' }))}</p>
          : <p className="small muted">এটি খসড়া রিপোর্ট। অ্যাডমিন চূড়ান্ত করার আগে বদলাতে পারে।</p>}
      </div>

      <div className="section">
        <h2>কে কাকে কত দেবেন</h2>
        <div className="card" style={{ marginTop: 8 }}>
          {rep.settlements.length === 0 ? <Empty icon="report" title={rep.members.length && rep.total ? 'সবার হিসাব মিটেছে ✓' : 'এখনও কোনো দেনা-পাওনা নেই'} /> : rep.settlements.map((x, i) => (
            <div className="item" key={i}>
              <div className="pay-line"><Avatar sm name={x.from_name} id={x.from} /><span className="arrow">→</span><Avatar sm name={x.to_name} id={x.to} /><div className="grow break"><b>{x.from_name}</b> <b>{x.to_name}</b>কে <b className="neg">{fmtMoney(x.amount, g)}</b> দেবেন।</div></div>
              {canPay && x.from === meId ? <div className="btn-row"><button className="btn small" onClick={() => setPaySheet({ to: x.to, amount: x.amount })}>পরিশোধ লিখুন</button></div> : null}
            </div>
          ))}
        </div>
        {canPay ? <div style={{ marginTop: 10 }}><button className="btn secondary" onClick={() => setPaySheet({})}>+ অন্য পরিশোধ লিখুন</button></div> : null}
      </div>

      <div className="section">
        <h2>কে কত বাজার করেছেন, কার ভাগ কত</h2>
        {rep.members.length === 0 ? <div className="card"><Empty icon="report" title="এখনও কোনো হিসাব নেই" /></div> : rep.members.map((m) => (
          <div className="card" key={m.id} style={{ marginTop: 8 }}>
            <div className="row"><Avatar name={m.name} id={m.id} /><b className="break grow">{m.name}{m.id === meId ? ' (আমি)' : ''}</b><Balance value={m.balance} g={g} /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 14px', marginTop: 8, fontSize: 14 }}>
              <span className="muted">বাজার</span><span className="muted">ভাগ</span>
              <b>{fmtMoney(m.purchased, g)}</b><b>{fmtMoney(m.share, g)}</b>
              {m.sent || m.received ? <><span className="muted" style={{ marginTop: 4 }}>পরিশোধ দিয়েছেন</span><span className="muted" style={{ marginTop: 4 }}>পেয়েছেন</span>
                <b>{fmtMoney(m.sent, g)}</b><b>{fmtMoney(m.received, g)}</b></> : null}
            </div>
          </div>
        ))}
      </div>

      {rep.payments.length > 0 ? (
        <div className="section">
          <h2>পরিশোধের তালিকা</h2>
          <div className="card" style={{ marginTop: 8 }}>
            {rep.payments.map((p) => {
              const [kind, label] = PAY_STATUS[p.status] || ['gray', p.status];
              return (
                <div className="item" key={p.id}>
                  <div className="row between" style={{ alignItems: 'flex-start' }}>
                    <div className="grow break"><b>{p.from_name}</b> → <b>{p.to_name}</b><div className="small muted">{dayLabel(new Date(p.created_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' }))}</div></div>
                    <div style={{ textAlign: 'right' }}><div className="amt">{fmtMoney(p.amount, g)}</div><Tag kind={kind}>{label}</Tag></div>
                  </div>
                  {p.status === 'pending' && p.to === meId && !finalized ? (
                    <div className="btn-row"><Btn busy={busy} className="small" onClick={() => payAct('confirm_payment', p.id, 'নিশ্চিত করা হয়েছে।')}>হ্যাঁ, পেয়েছি</Btn>
                      <Btn busy={busy} className="small danger secondary" onClick={() => payAct('reject_payment', p.id, 'জানানো হয়েছে।')}>পাইনি</Btn></div>) : null}
                  {p.status === 'pending' && p.from === meId && !finalized ? (
                    <div className="btn-row"><Btn busy={busy} className="small secondary" onClick={() => payAct('cancel_payment', p.id, 'বাতিল করা হয়েছে।')}>লেখাটি বাতিল করুন</Btn></div>) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {!finalized && (pendingCorr.length > 0 || doneCorr.length > 0 || (s.isActive && correctionWindowOpen(s.month, today))) ? (
        <div className="section">
          <h2>সংশোধনের অনুরোধ</h2>
          {s.isActive && correctionWindowOpen(s.month, today) ? (
            <div className="banner green">আগের মাসের বাদ পড়া বা ভুল বাজার ঠিক করতে পরের মাসের প্রথম দুই দিন অনুরোধ করা যায়। অ্যাডমিন দেখে অনুমোদন করবেন।
              <div className="btn-row"><button className="btn small" onClick={() => setCorrSheet(true)}>+ সংশোধনের অনুরোধ</button></div></div>) : null}
          {[...pendingCorr, ...doneCorr].map((c) => <CorrectionCard key={c.id} c={c} g={g} admin={s.isAdmin && !finalized} busy={busy} onResolve={resolve} />)}
        </div>
      ) : null}

      {finalized && rep.pending_payments > 0 ? <div className="banner" style={{ marginTop: 16 }}>এই মাস চূড়ান্ত হওয়ার সময় {rep.pending_payments}টি পরিশোধ নিশ্চিত হয়নি। সেগুলো হিসাবে ধরা হয়নি।</div> : null}

      <div className="section noprint">
        {s.isAdmin && !finalized && monthEnded ? <Btn busy={busy} onClick={startFinalize}>এই মাসের হিসাব চূড়ান্ত করুন</Btn> : null}
        {s.isAdmin && !finalized && !monthEnded ? <p className="small muted center">মাস শেষ হলে অ্যাডমিন এখান থেকে হিসাব চূড়ান্ত করতে পারবেন।</p> : null}
        <div style={{ marginTop: 10 }}><button className="btn secondary" onClick={() => window.print()}>প্রিন্ট / PDF হিসেবে সংরক্ষণ</button></div>
        {!finalized ? <p className="small muted center">প্রিন্ট বাটনে চাপ দিয়ে “PDF হিসেবে সংরক্ষণ” বেছে নিন।</p> : null}
      </div>

      {paySheet ? <PaySheet init={paySheet} onClose={() => setPaySheet(null)} /> : null}
      {corrSheet ? <CorrectionSheet onClose={() => setCorrSheet(false)} /> : null}
      {finSheet ? (
        <Sheet title="চূড়ান্ত করার আগে দেখুন" onClose={() => setFinSheet(null)}>
          <div className="banner red">
            {finSheet.pending_corrections > 0 ? <p>অমীমাংসিত সংশোধনের অনুরোধ: <b>{finSheet.pending_corrections}টি</b> (এগুলো বাতিল হয়ে যাবে)</p> : null}
            {finSheet.pending_payments > 0 ? <p>নিশ্চিত হয়নি এমন পরিশোধ: <b>{finSheet.pending_payments}টি</b> (এগুলো হিসাবে ধরা হবে না)</p> : null}
          </div>
          {rep.payments.filter((p) => p.status === 'pending').map((p) => <div key={p.id} className="small" style={{ marginTop: 6 }}>{p.from_name} → {p.to_name}: {fmtMoney(p.amount, g)}</div>)}
          <p className="small muted">প্রাপকদের আগে নিশ্চিত করতে বলা বা অনুরোধগুলো নিষ্পত্তি করাই ভালো। চাইলে এখনই চূড়ান্ত করতে পারেন।</p>
          <div className="btn-row"><button className="btn secondary" onClick={() => setFinSheet(null)}>আগে ঠিক করি</button><Btn busy={busy} className="danger" onClick={forceFinalize}>তবুও চূড়ান্ত করুন</Btn></div>
        </Sheet>) : null}
      {confirmNode}
    </>
  );
}

function CorrectionCard({ c, g, admin, busy, onResolve }) {
  const [kind, label] = c.status === 'pending' ? ['amber', 'অপেক্ষায়'] : c.status === 'approved' ? ['', 'অনুমোদিত'] : ['red', 'বাতিল'];
  return (
    <div className="card" style={{ marginTop: 8 }}>
      <div className="row between"><b>{KIND[c.kind]}</b><Tag kind={kind}>{label}</Tag></div>
      <p className="small muted">অনুরোধ করেছেন {c.requested_by_name}{c.reason ? ` · কারণ: ${c.reason}` : ''}</p>
      {c.kind !== 'delete' ? (
        <div className="kv"><span className="k">তারিখ</span><span>{c.date ? dayLabel(c.date) : ''}</span><span className="k">কী</span><span className="break">{c.description}</span><span className="k">ক্রেতা</span><span>{c.buyer_name}</span><span className="k">টাকা</span><b>{fmtMoney(c.amount, g)}</b></div>) : null}
      {c.old ? <div className="small muted" style={{ marginTop: 6 }}>{c.kind === 'delete' ? 'যে বাজার মুছবে' : 'আগে ছিল'}: {dayLabel(c.old.date)} · {c.old.description} · {fmtMoney(c.old.amount, g)}</div> : null}
      {c.status === 'pending' ? (
        <>
          <div className="small muted" style={{ marginTop: 8 }}>{c.kind === 'delete' ? 'এই সদস্যদের ভাগ কমবে:' : 'নতুন ভাগ:'}</div>
          <div className="shares">{(c.kind === 'delete' ? c.old?.shares || [] : c.new_shares).map((x) => <React.Fragment key={x.member_id}><span>{x.name}</span><span>{fmtMoney(x.share, g)}</span></React.Fragment>)}</div>
          {c.kind === 'edit' && c.old ? <div className="small muted" style={{ marginTop: 6 }}>আগের ভাগ: {c.old.shares.map((x) => `${x.name} ${fmtMoney(x.share, g)}`).join(', ')}</div> : null}
        </>
      ) : null}
      {admin && c.status === 'pending' ? <div className="btn-row"><Btn busy={busy} className="small" onClick={() => onResolve(c, true)}>অনুমোদন</Btn><Btn busy={busy} className="small danger secondary" onClick={() => onResolve(c, false)}>বাতিল</Btn></div> : null}
    </div>
  );
}

function PaySheet({ init, onClose }) {
  const s = useStore(); const g = s.group; const dec = g.currency_decimals;
  const others = s.data.members.filter((m) => m.id !== s.me.id && m.user_id);
  const [to, setTo] = useState(init.to || others[0]?.id || '');
  const [amt, setAmt] = useState(init.amount ? minorToInput(init.amount, dec) : '');
  const [busy, run] = useAction(); const toast = useToast();
  const token = useMemo(() => newToken(), []);
  const submit = (e) => {
    e.preventDefault();
    const a = parseMoney(amt, dec);
    if (!to) return toast('কাকে দিয়েছেন বেছে নিন।', true);
    if (!a || a <= 0) return toast('পরিশোধের টাকা লিখুন।', true);
    run(async () => { await rpc('add_payment', { p_group: s.gid, p_token: token, p_month: s.month, p_to: to, p_amount: a, p_note: null }); await s.reloadGroup(); onClose(); }, 'পরিশোধ লেখা হয়েছে। প্রাপক নিশ্চিত করলে হিসাবে যোগ হবে।');
  };
  return (
    <Sheet title="পরিশোধ লিখুন" onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="কাকে দিয়েছেন"><select value={to} onChange={(e) => setTo(e.target.value)}>{others.map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}</select></Field>
        <Field label={`কত ${g.currency_name}`}><input type="text" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} autoFocus /></Field>
        <p className="small muted">প্রাপকের কাছে নিশ্চিত করার অনুরোধ যাবে। তিনি নিশ্চিত করার পরই আপনার বাকি কমবে।</p>
        <div className="btn-row"><button type="button" className="btn secondary" onClick={onClose}>থাক</button><Btn busy={busy} type="submit">লিখে রাখুন</Btn></div>
      </form>
    </Sheet>
  );
}

function CorrectionSheet({ onClose }) {
  const s = useStore(); const g = s.group; const dec = g.currency_decimals; const toast = useToast();
  const [kind, setKind] = useState('add');
  const [pid, setPid] = useState('');
  const monthEnd = new Date(new Date(addMonths(s.month, 1) + 'T00:00:00Z').getTime() - 86400000).toISOString().slice(0, 10);
  const [date, setDate] = useState(monthEnd);
  const [buyer, setBuyer] = useState(s.me.id); const [desc, setDesc] = useState(''); const [amt, setAmt] = useState(''); const [reason, setReason] = useState('');
  const [busy, run] = useAction();
  const token = useMemo(() => newToken(), []);
  const purchases = s.data.purchases;
  const pick = (id) => {
    setPid(id); const p = purchases.find((x) => x.id === id);
    if (p) { setDate(p.bazar_date); setBuyer(p.buyer_id); setDesc(p.description); setAmt(minorToInput(p.amount, dec)); }
  };
  const submit = (e) => {
    e.preventDefault();
    const a = parseMoney(amt, dec);
    if (kind !== 'add' && !pid) return toast('কোন বাজারটি তা বেছে নিন।', true);
    if (kind !== 'delete' && (!a || a <= 0 || !desc.trim())) return toast('কী কিনেছেন ও টাকা লিখুন।', true);
    run(async () => {
      await rpc('request_correction', { p_group: s.gid, p_token: token, p_month: s.month, p_kind: kind, p_purchase: kind === 'add' ? null : pid,
        p_date: kind === 'delete' ? null : date, p_buyer: kind === 'delete' ? null : buyer, p_desc: kind === 'delete' ? null : desc, p_amount: kind === 'delete' ? null : a, p_items: [], p_reason: reason });
      await s.reloadGroup(); onClose();
    }, 'অনুরোধ অ্যাডমিনের কাছে গেছে।');
  };
  return (
    <Sheet title={`${monthLabel(s.month)} মাসের সংশোধনের অনুরোধ`} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="seg">{[['add', 'বাদ পড়া বাজার'], ['edit', 'ভুল ঠিক'], ['delete', 'মুছতে চাই']].map(([k, l]) => <button type="button" key={k} className={kind === k ? 'on' : ''} onClick={() => { setKind(k); setPid(''); }}>{l}</button>)}</div>
        {kind !== 'add' ? (
          <Field label="কোন বাজার"><select value={pid} onChange={(e) => pick(e.target.value)}><option value="">— বেছে নিন —</option>
            {purchases.map((p) => <option key={p.id} value={p.id}>{dayLabel(p.bazar_date)} · {p.description} · {fmtMoney(p.amount, g)}</option>)}</select></Field>) : null}
        {kind !== 'delete' ? (
          <>
            <Field label="কী কিনেছেন"><input type="text" value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
            <Field label={`মোট খরচ (${g.currency_name})`}><input type="text" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} /></Field>
            <Field label="বাজারের তারিখ"><input type="date" value={date} min={s.month} max={monthEnd} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label="ক্রেতা"><select value={buyer} onChange={(e) => setBuyer(e.target.value)}>{s.data.members.map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}</select></Field>
          </>) : null}
        <Field label="কারণ (ঐচ্ছিক)"><input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="যেমন: ৩০ তারিখ রাতে লিখতে ভুলে গিয়েছিলাম" /></Field>
        <div className="btn-row"><button type="button" className="btn secondary" onClick={onClose}>থাক</button><Btn busy={busy} type="submit">অনুরোধ পাঠান</Btn></div>
      </form>
    </Sheet>
  );
}
