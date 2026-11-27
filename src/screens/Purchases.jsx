import React, { useEffect, useState } from 'react';
import { useStore } from '../store.jsx';
import { Header, Avatar, Empty } from './parts.jsx';
import { addMonths, fmtMoney, parseMoney, minorToInput, todayDhaka, monthOf, dayLabel, newToken, fmtNum } from '../lib/format.js';
import { Btn, Field, useAction, useConfirm, useToast } from '../ui.jsx';
import { rpc, supabase, q } from '../lib/supabase.js';
import { go } from '../App.jsx';

export function PurchaseList() {
  const s = useStore(); const g = s.group;
  const [open, setOpen] = useState(null);
  const [search, setSearch] = useState(''); const [who, setWho] = useState('');
  const toast = useToast();
  const [hist, setHist] = useState({});
  const loadHistory = async (id) => {
    if (hist[id]) return;
    try { const rows = await q(supabase.from('purchase_history').select('*').eq('purchase_id', id).order('changed_at')); setHist((h) => ({ ...h, [id]: rows })); }
    catch { toast('পরিবর্তনের ইতিহাস আনা যায়নি। আবার খুলে চেষ্টা করুন।', true); }
  };
  const [ask, confirmNode] = useConfirm();
  const [busy, run] = useAction();
  const canEdit = (p) => !s.data.closures.some(d => d.ledger_date === p.bazar_date) && s.isActive && s.data.report.status !== 'finalized' && p.buyer_id === s.me.id;
  const nameOf = (id) => s.data.members.find((m) => m.id === id)?.display_name || '';
  const del = async (p) => {
    const ok = await ask({ title: 'বাজারটি মুছবেন?', body: `“${p.description}” (${fmtMoney(p.amount, g)}) মুছে ফেললে সবার হিসাব থেকে এটি বাদ যাবে। খবরের তালিকায় মোছার কথা দেখাবে।`, confirmText: 'হ্যাঁ, মুছুন', danger: true });
    if (ok) run(async () => { await rpc('delete_purchase', { p_id: p.id }); await s.reloadGroup(); }, 'মুছে ফেলা হয়েছে।');
  };
  const list = s.data.purchases.filter((p) => (!who || p.buyer_id === who) && (!search.trim() || p.description.toLowerCase().includes(search.trim().toLowerCase())
    || p.purchase_items.some((i) => i.name.toLowerCase().includes(search.trim().toLowerCase()))));
  const filtered = Boolean(search.trim() || who);
  const ACT = { created: 'লেখা হয়েছে', edited: 'সংশোধন হয়েছে (আগে ছিল)', deleted: 'মুছে ফেলা হয়েছে (আগে ছিল)' };
  let lastDate = '';
  return (
    <>
      <Header title="বাজারের তালিকা" />
      {s.data.purchases.length > 0 && <div className="filters noprint">
        <input type="search" aria-label="বাজার খুঁজুন" placeholder="কী কিনেছেন খুঁজুন…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select aria-label="ক্রেতা অনুযায়ী" value={who} onChange={(e) => setWho(e.target.value)}>
          <option value="">সব ক্রেতা</option>{s.data.members.map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}
        </select>
      </div>}
      {filtered && s.data.purchases.length > 0 && <p className="small muted" style={{ marginTop: 8 }}>{fmtNum(list.length)}টি বাজার, মোট {fmtMoney(list.reduce((a, p) => a + p.amount, 0), g)}</p>}
      <div className="card" style={{ marginTop: 6 }}>
        {s.data.purchases.length === 0 ? <Empty title="এ মাসে কোনো বাজার নেই" /> : list.length === 0 ? <Empty title="কিছু পাওয়া যায়নি"><button type="button" className="btn small secondary" onClick={() => { setSearch(''); setWho(''); }}>সব বাজার দেখুন</button></Empty> : list.map((p) => {
          const head = p.bazar_date !== lastDate ? <div className="date-head">{dayLabel(p.bazar_date)}</div> : null;
          lastDate = p.bazar_date;
          return (
            <div key={p.id}>
              {head}
              <div className="item">
                <button type="button" className="row purchase-toggle" aria-expanded={open === p.id} onClick={() => { setOpen(open === p.id ? null : p.id); if (open !== p.id) loadHistory(p.id); }}>
                  <Avatar name={nameOf(p.buyer_id)} id={p.buyer_id} />
                  <span className="grow"><span className="t break" style={{whiteSpace: 'pre-line'}}>{p.description}</span><small className="muted">ক্রেতা: {nameOf(p.buyer_id)}</small></span>
                  <span className="amt">{fmtMoney(p.amount, g)}</span>
                  <span aria-hidden="true">{open === p.id ? "−" : "+"}</span>
                </button>
                {open === p.id ? (
                  <div style={{ marginTop: 8 }}>
                    {p.purchase_items.length > 0 ? (
                      <div className="kv" style={{ marginBottom: 8 }}>{p.purchase_items.map((i) => <React.Fragment key={i.id}><span className="k">{i.name}</span><span>{fmtMoney(i.amount, g)}</span></React.Fragment>)}</div>
                    ) : null}
                    <div className="small muted">যাঁদের ভাগে:</div>
                    <div className="shares">{p.purchase_shares.map((x) => <React.Fragment key={x.member_id}><span>{nameOf(x.member_id)}</span><span>{fmtMoney(x.share, g)}</span></React.Fragment>)}</div>
                    {(hist[p.id] || []).length > 1 ? <details className="hist"><summary className="small">পরিবর্তনের ইতিহাস ({fmtNum(hist[p.id].length)})</summary>
                      {hist[p.id].map((h) => <div className="small" key={h.id}>{new Date(h.changed_at).toLocaleString('bn-BD', { timeZone: 'Asia/Dhaka', dateStyle: 'medium', timeStyle: 'short' })} · {nameOf(h.changed_by) || 'কেউ'} {ACT[h.action]}{h.action !== 'created' ? `: ${h.snapshot.description}, ${fmtMoney(h.snapshot.amount, g)}` : ''}</div>)}
                    </details> : null}
                    {canEdit(p) ? <div className="btn-row">
                      <button className="btn small secondary" onClick={() => go(`#/edit/${p.id}`)}>সংশোধন</button>
                      <Btn busy={busy} className="small danger secondary" onClick={() => del(p)}>মুছুন</Btn></div> : null}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      {s.isActive && s.data.report.status !== 'finalized' && s.month === monthOf(todayDhaka()) ? <div className="cta-bar"><button className="btn" onClick={() => go('#/add')}>+ বাজার যোগ করুন</button></div> : null}
      {confirmNode}
    </>
  );
}

export function PurchaseForm({ editId }) {
  const s = useStore(); const g = s.group; const toast = useToast();
  const dec = g.currency_decimals;
  const editing = editId ? s.data.purchases.find((p) => p.id === editId) : null;
  const today = todayDhaka(); const cm = monthOf(today);
  const [ask, confirmNode] = useConfirm();
  const [busy, run] = useAction();
  const [date, setDate] = useState(editing?.bazar_date || today);
  const [items, setItems] = useState(() => editing?.purchase_items?.length
    ? editing.purchase_items.map(i => ({name:i.name,amount:minorToInput(i.amount,dec),token:newToken()}))
    : [{name:editing?.description || '',amount:editing ? minorToInput(editing.amount,dec) : '',token:newToken()}]);
  const [preview, setPreview] = useState([]);
  const legacyItems = !!editing?.purchase_items?.length;
  const itemsMinor = items.map(i => ({name:i.name.trim(),amount:parseMoney(i.amount,dec),token:i.token}));
  const amount = itemsMinor.reduce((sum,i) => sum + (i.amount || 0), 0);
  const validItems = itemsMinor.every(i => i.name && i.amount > 0);

  useEffect(() => {
    if (!amount || amount <= 0) { setPreview([]); return undefined; }
    let current = true;
    setPreview([]);
    const t = setTimeout(async () => {
      try {
        const splits = await Promise.all((legacyItems ? [amount] : itemsMinor.map(i=>i.amount).filter(a=>a>0)).map(a=>rpc('preview_split',{p_group:s.gid,p_date:date,p_amount:a})));
        const combined = new Map();
        for (const rows of splits) for (const row of rows) {
          combined.set(row.member_id,{...row,share:(combined.get(row.member_id)?.share || 0)+Number(row.share)});
        }
        const shares = [...combined.values()];
        if (current) setPreview(shares);
      } catch { /* The preview stays empty when the request fails. */ }
    }, 250);
    return () => { current = false; clearTimeout(t); };
  }, [amount, date, s.gid, items]);

  const setItem = (i, k, v) => setItems((a) => a.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const submit = (e) => {
    e.preventDefault();
    if (!validItems) return toast('প্রতিটি পণ্যের নাম ও দাম দিন।', true);
    run(async () => {
      if (editing) await rpc('update_purchase', {p_id:editing.id,p_date:date,p_buyer:s.me.id,
        p_desc:legacyItems ? editing.description : itemsMinor[0].name,p_amount:amount,
        p_items:legacyItems ? itemsMinor.map(({name,amount}) => ({name,amount})) : []});
      else await rpc('add_products', {p_group:s.gid,p_date:date,p_rows:itemsMinor});
      await s.reloadGroup(); go('#/');
      toast(editing ? 'সংশোধন সংরক্ষিত হয়েছে।' : 'বাজার যোগ হয়েছে।');
    });
  };
  const remove = async () => {
    const ok = await ask({ title: 'বাজারটি মুছবেন?', body: 'মুছে ফেললে সবার হিসাব থেকে এটি বাদ যাবে।', confirmText: 'হ্যাঁ, মুছুন', danger: true });
    if (ok) run(async () => { await rpc('delete_purchase', { p_id: editing.id }); await s.reloadGroup(); go('#/list'); }, 'মুছে ফেলা হয়েছে।');
  };
  if (!s.isActive || (!editId && (s.month !== cm || s.data.report.status === 'finalized')) || (editId && (!editing || editing.buyer_id !== s.me?.id || s.data.closures.some(d => d.ledger_date === editing.bazar_date) || s.data.report.status === 'finalized'))) return <div className="app no-nav"><p className="muted center" style={{ marginTop: 60 }}>বাজারটি পাওয়া যায়নি।</p><button className="btn" onClick={() => go('#/list')}>ফিরে যান</button></div>;

  return (
    <div className="app no-nav">
      <div className="topbar"><div className="row"><button className="monthbar nb" style={{ width: 44, height: 44, borderRadius: 50, border: '1.5px solid var(--line)', background: 'var(--card)', color: 'var(--green)', fontSize: 20 }} onClick={() => go(editing ? '#/list' : '#/')} aria-label="ফিরে যান">←</button><h1 className="grow">{editing ? 'বাজার সংশোধন' : 'বাজার যোগ করুন'}</h1></div></div>
      <form className="card" onSubmit={submit}>
        {items.map((it,i) => <div className="row" key={it.token} style={{marginBottom:10,alignItems:'end'}}>
          <div className="grow"><Field label="পণ্যের নাম"><input required maxLength={legacyItems || !editing ? 100 : 200} value={it.name} onChange={e=>setItem(i,'name',e.target.value)} placeholder="চাল" /></Field></div>
          <div style={{width:'32%',minWidth:0}}><Field label="দাম"><input required inputMode="decimal" value={it.amount} onChange={e=>setItem(i,'amount',e.target.value)} placeholder="০" /></Field></div>
          {items.length>1 && <button type="button" className="btn small secondary" aria-label="পণ্য সরান" onClick={()=>setItems(a=>a.filter((_,j)=>j!==i))}>×</button>}
        </div>)}
        {(!editing || legacyItems) && <button type="button" className="btn secondary" disabled={items.length>=100} onClick={()=>setItems(a=>[...a,{name:'',amount:'',token:newToken()}])}>+ আরেকটি পণ্য যোগ করুন</button>}
        <div className="row between" style={{marginTop:16}}><b>মোট</b><b>{fmtMoney(amount,g)}</b></div>
        <Field label="বাজারের তারিখ"><input type="date" value={date} min={editing?.month || cm} max={editing && editing.month < cm ? new Date(Date.parse(addMonths(editing.month, 1)) - 86400000).toISOString().slice(0, 10) : today} onChange={(e) => setDate(e.target.value)} required /></Field>
        <p className="small muted">ক্রেতা: {s.me?.display_name}</p>

        <div className="card" style={{ marginTop: 16, background: '#f4efdc', boxShadow: 'none' }}>
          <h3>কারা ভাগে আছেন</h3>
          {preview.length === 0 ? <p className="small muted">টাকা লিখলে প্রত্যেকের ভাগ এখানে দেখাবে।</p> : (
            <>
              <div className="shares" style={{ marginTop: 6 }}>{preview.map((x) => <React.Fragment key={x.member_id}><span>{x.name}</span><b>{fmtMoney(x.share, g)}</b></React.Fragment>)}</div>
              <p className="small muted">ঐ তারিখে খাওয়ায় সক্রিয় সবাই সমান ভাগ করবেন।</p>
            </>
          )}
        </div>
        {editing ? <div style={{ marginTop: 14 }}><Btn busy={busy} type="button" className="danger secondary" onClick={remove}>বাজারটি মুছুন</Btn></div> : null}
        {s.data.closures.some(d => d.ledger_date === date) && <p role="status">এই তারিখ বন্ধ। অন্য তারিখ বেছে নিন।</p>}
        <div className="cta-bar form"><Btn disabled={s.data.closures.some(d => d.ledger_date === date)} busy={busy} type="submit">{editing ? 'সংশোধন সংরক্ষণ করুন' : 'সংরক্ষণ করুন'}</Btn></div>
      </form>
      {confirmNode}
    </div>
  );
}
