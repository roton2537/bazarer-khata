import React, { useEffect, useState } from 'react';
import { rpc, supabase } from '../lib/supabase.js';
import { useStore } from '../store.jsx';
import { Btn, Field, Sheet, Tag, useAction, useConfirm, useToast } from '../ui.jsx';
import { dateLabel, dayLabel, todayDhaka, monthOf, toBnDigits } from '../lib/format.js';
import { enablePush, disablePush, pushSupported } from '../lib/push.js';
import { go } from '../App.jsx';
import { Avatar, Header } from './parts.jsx';

export default function Members({ view = 'members' }) {
  const s = useStore(); const g = s.group; const toast = useToast();
  const [ask, confirmNode] = useConfirm();
  const [busy, run] = useAction();
  const [pauseSheet, setPauseSheet] = useState(false);
  const [transferSheet, setTransferSheet] = useState(null); // 'leave' | 'transfer'
  const today = todayDhaka();
  const pausedNow = (m) => s.data.pauses.some((p) => p.member_id === m.id && p.start_date <= today && (!p.end_date || today < p.end_date));
  const myPauses = s.data.pauses.filter((p) => p.member_id === s.me?.id && (!p.end_date || p.end_date > today));
  const others = s.data.members.filter((m) => !m.left_on && m.id !== s.me?.id && m.user_id);
  const pushOn = !!s.profile?.push_enabled;

  const togglePush = () => run(async () => {
    if (pushOn) await disablePush(); else await enablePush();
    await s.refresh();
  }, pushOn ? 'নোটিফিকেশন বন্ধ করা হয়েছে।' : 'নোটিফিকেশন চালু হয়েছে।');

  const endPause = (p) => run(async () => { await rpc('end_pause', { p_pause: p.id, p_return: null }); await s.reloadGroup(); }, 'আজ থেকে আবার খাওয়ায় ফিরছেন।');

  const leave = async () => {
    if (s.isAdmin && !s.data.members.some((m) => m.role === 'admin' && !m.left_on && m.id !== s.me.id)) {
      if (others.length === 0) return toast('আপনিই একমাত্র সদস্য। গ্রুপ ছাড়ার বদলে গ্রুপটি মুছে ফেলুন।', true);
      return setTransferSheet('leave');
    }
    const ok = await ask({ title: 'গ্রুপ ছাড়বেন?',
      body: `আজকের পরের বাজার থেকে আপনার ভাগ আর পড়বে না।\nআগের বাজার, আপনার পাওনা ও দেনা ইতিহাসে থাকবে এবং অন্যদের পুরোনো হিসাব বদলাবে না।\nছাড়ার পরও আপনি হিসাব দেখতে ও বাকি টাকা মেটাতে পারবেন, কিন্তু নতুন বাজার লিখতে পারবেন না।`,
      confirmText: 'হ্যাঁ, গ্রুপ ছাড়ব', danger: true });
    if (ok) run(async () => { await rpc('leave_group', { p_group: s.gid }); await s.refresh(); }, 'আপনি গ্রুপ ছেড়েছেন।');
  };
  const removeMember = async (m) => {
    const ok = await ask({ title: `${m.display_name}-কে সরাবেন?`,
      body: 'আজকের পরের বাজার থেকে তাঁর ভাগ পড়বে না। আগের হিসাব অপরিবর্তিত থাকবে।\nতিনি শুধু তাঁর সদস্য-থাকা মাসগুলোর হিসাব দেখতে ও বাকি টাকা মেটাতে পারবেন, নতুন মাসের কিছুই দেখতে পাবেন না।',
      confirmText: 'সরিয়ে দিন', danger: true });
    if (ok) run(async () => { await rpc('remove_member', { p_group: s.gid, p_member: m.id }); await s.reloadGroup(); }, `${m.display_name}-কে সরানো হয়েছে।`);
  };
  const delGroup = async () => {
    const ok = await ask({ title: 'পুরো গ্রুপ মুছে ফেলবেন?',
      body: `“${g.name}” গ্রুপের সব বাজার, ভাগ, পরিশোধ, মাসিক রিপোর্ট ও খবর সবার জন্য চিরতরে মুছে যাবে। এটি আর ফেরানো যাবে না।\nআগে দরকারি রিপোর্ট প্রিন্ট বা PDF করে রাখতে পারেন।`,
      confirmText: 'চিরতরে মুছুন', danger: true, requireText: g.name });
    if (ok) run(async () => { await rpc('delete_group', { p_group: s.gid }); await s.refresh(); go('#/'); }, 'গ্রুপ মুছে ফেলা হয়েছে।');
  };

  return (
    <>
      <Header title={view === 'settings' ? 'সেটিংস' : 'সদস্য ও আমন্ত্রণ'} />
      {view === 'members' && <>

      <div className="card">
        <h2>সদস্য ({toBnDigits(s.data.members.filter((m) => !m.left_on).length)} জন)</h2>
        {s.data.members.map((m) => (
          <div className="item row" key={m.id}>
            <Avatar name={m.display_name} id={m.id} />
            <div className="grow break"><span className="t">{m.display_name}</span>{m.id === s.me?.id ? ' (আমি)' : ''}
              <div className="small muted">যোগ দিয়েছেন {dateLabel(m.joined_on)}</div></div>
            <div className="member-tags">{m.left_on ? <Tag kind="gray">ছেড়েছেন</Tag> : pausedNow(m) ? <Tag kind="amber">বিরতিতে</Tag> : <Tag>সক্রিয়</Tag>} {m.role === 'admin' && !m.left_on ? <Tag kind="gray">অ্যাডমিন</Tag> : null}
              {s.isAdmin && !m.left_on && m.role !== 'admin' && m.id !== s.me?.id ? <button className="btn small ghost danger-text" onClick={() => removeMember(m)}>সরান</button> : null}</div>
          </div>
        ))}
      </div>

      {s.isAdmin && <AdminInvite key={s.gid} group={g} members={s.data.members} />}
      </>}

      {view === 'settings' && <>

      {s.isActive ? (
        <div className="card">
          <h2>খাওয়ার বিরতি</h2>
          <p className="small muted">ছুটিতে থাকলে বিরতি দিন। বিরতির প্রথম দিন থেকে আপনার ভাগ বন্ধ থাকবে, ফেরার দিন থেকে আবার শুরু হবে।</p>
          {myPauses.map((p) => (
            <div className="item row between" key={p.id}>
              <div className="grow small">{dayLabel(p.start_date)} থেকে {p.end_date ? `${dayLabel(p.end_date)} পর্যন্ত (ফেরার দিন ${dayLabel(p.end_date)})` : 'ফেরার তারিখ ঠিক হয়নি'}</div>
              <Btn busy={busy} className="small secondary" onClick={() => endPause(p)}>{p.start_date >= today ? 'বাতিল' : 'আজ ফিরেছি'}</Btn>
            </div>
          ))}
          <div className="btn-row"><button className="btn secondary" onClick={() => setPauseSheet(true)}>+ বিরতি দিন</button></div>
        </div>
      ) : null}

      <div className="card">
        <h2>নোটিফিকেশন</h2>
        <p className="small muted">কেউ বাজার যোগ করলে বা পরিশোধ লিখলে ফোনে জানানো হবে। বন্ধ থাকলেও অ্যাপের ভেতরে “খবর” ঠিকই দেখা যাবে।</p>
        <div className="btn-row"><Btn busy={busy} className={pushOn ? 'secondary' : ''} onClick={togglePush} disabled={!pushSupported() && !pushOn}>{pushOn ? 'পুশ নোটিফিকেশন বন্ধ করুন' : 'পুশ নোটিফিকেশন চালু করুন'}</Btn></div>
        {pushOn ? <div className="btn-row"><Btn busy={busy} className="secondary small" onClick={() => run(async () => { await rpc('send_test_push', { p_group: s.gid }); }, 'পাঠানো হয়েছে। কয়েক সেকেন্ডে ফোনে আসার কথা। না এলে অ্যাডমিন সার্ভারের পুশ-সেটআপ দেখে নেবেন।')}>পরীক্ষামূলক নোটিফিকেশন পাঠান</Btn></div> : null}
        {!pushSupported() ? <p className="small muted">এই ব্রাউজারে পুশ নোটিফিকেশন চলবে না।</p> : null}
      </div>

      <div className="card">
        <h2>খাতা ও অ্যাকাউন্ট</h2>
        <p className="small muted">{s.session.user.email?.replace('@members.bazarer-khata.invalid','') || s.me?.display_name}</p>
        <div className="stack" style={{ marginTop: 8 }}>
          {s.isAdmin && others.length > 0 ? <button className="btn secondary" onClick={() => setTransferSheet('transfer')}>অ্যাডমিনের দায়িত্ব অন্যকে দিন</button> : null}
          <button className="btn secondary" onClick={() => go('#/new-group')}>+ আরেকটি গ্রুপ খুলুন বা যোগ দিন</button>
          <button className="btn secondary" onClick={() => go('#/account')}>আমার অ্যাকাউন্ট</button>
          <Btn busy={busy} className="secondary" onClick={() => run(async () => {
            const {error} = await supabase.auth.signOut({scope:'local'});
            if (error) throw error;
            go('#/');
          })}>লগআউট</Btn>
        </div>
      </div>

      {s.isActive ? (
        <div className="card danger-zone">
          <h2>বিপজ্জনক কাজ</h2>
          <p className="small muted">এগুলো করার আগে নিশ্চিত হয়ে নিন। প্রতিটির আগে আরেকবার জিজ্ঞেস করা হবে।</p>
          <div className="stack" style={{ marginTop: 8 }}>
            <Btn busy={busy} className="danger secondary" onClick={leave}>এই গ্রুপ ছেড়ে যান</Btn>
            {s.isAdmin ? <Btn busy={busy} className="danger secondary" onClick={delGroup}>পুরো গ্রুপ মুছে ফেলুন</Btn> : null}
          </div>
        </div>
      ) : null}
      </>}

      {pauseSheet ? <PauseSheet onClose={() => setPauseSheet(false)} /> : null}
      {transferSheet ? <TransferSheet mode={transferSheet} others={others} onClose={() => setTransferSheet(null)} /> : null}
      {confirmNode}
    </>
  );
}

function PauseSheet({ onClose }) {
  const s = useStore(); const toast = useToast();
  const today = todayDhaka();
  const [start, setStart] = useState(today); const [end, setEnd] = useState('');
  const [busy, run] = useAction();
  const [ask, node] = useConfirm();
  const submit = async (e) => {
    e.preventDefault();
    if (end && end <= start) return toast('ফেরার তারিখ শুরুর তারিখের পরে হতে হবে।', true);
    const ok = await ask({ title: 'বিরতি নিশ্চিত করবেন?',
      body: `${dayLabel(start)} থেকে আপনার খাওয়ার ভাগ বন্ধ থাকবে${end ? `, ${dayLabel(end)} থেকে আবার শুরু হবে` : '; ফিরে এসে “আজ ফিরেছি” চাপলে আবার শুরু হবে'}।\nএই তারিখ থেকে চলতি মাসে ইতিমধ্যে লেখা বাজারের ভাগও নতুন করে হিসাব হবে।`, confirmText: 'বিরতি দিন' });
    if (ok) run(async () => { await rpc('set_pause', { p_group: s.gid, p_start: start, p_end: end || null }); await s.reloadGroup(); onClose(); }, 'বিরতি সংরক্ষিত হয়েছে।');
  };
  return (
    <Sheet title="খাওয়ার বিরতি" onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="বিরতির প্রথম দিন"><input type="date" value={start} min={monthOf(today)} onChange={(e) => setStart(e.target.value)} required /></Field>
        <Field label="ফেরার দিন (জানা থাকলে)" hint="এই দিন থেকে আবার ভাগে থাকবেন"><input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} /></Field>
        <div className="btn-row"><button type="button" className="btn secondary" onClick={onClose}>থাক</button><Btn busy={busy} type="submit">এগিয়ে যান</Btn></div>
      </form>
      {node}
    </Sheet>
  );
}

function TransferSheet({ mode, others, onClose }) {
  const s = useStore();
  const [to, setTo] = useState(others[0]?.id || '');
  const [busy, run] = useAction();
  const name = others.find((m) => m.id === to)?.display_name;
  const submit = (e) => {
    e.preventDefault();
    run(async () => {
      await rpc('transfer_admin', { p_group: s.gid, p_member: to });
      if (mode === 'leave') await rpc('leave_group', { p_group: s.gid });
      await s.refresh(); onClose();
    }, mode === 'leave' ? 'দায়িত্ব দিয়ে গ্রুপ ছেড়েছেন।' : 'অ্যাডমিনের দায়িত্ব দেওয়া হয়েছে।');
  };
  return (
    <Sheet title={mode === 'leave' ? 'ছাড়ার আগে দায়িত্ব দিন' : 'অ্যাডমিনের দায়িত্ব দিন'} onClose={onClose}>
      <form onSubmit={submit}>
        <p>{mode === 'leave' ? 'আপনি একমাত্র অ্যাডমিন, তাই গ্রুপ ছাড়ার আগে অন্য একজনকে অ্যাডমিন বানাতে হবে।' : 'যাঁকে দায়িত্ব দেবেন তিনি মাসের হিসাব চূড়ান্ত করা ও সংশোধনের অনুরোধ নিষ্পত্তি করতে পারবেন। আপনি সাধারণ সদস্য হয়ে যাবেন।'}</p>
        <Field label="নতুন অ্যাডমিন"><select value={to} onChange={(e) => setTo(e.target.value)}>{others.map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}</select></Field>
        <div className="btn-row"><button type="button" className="btn secondary" onClick={onClose}>থাক</button>
          <Btn busy={busy} type="submit" className={mode === 'leave' ? 'danger' : ''}>{mode === 'leave' ? `${name || ''}-কে দায়িত্ব দিয়ে ছাড়ুন` : 'দায়িত্ব দিন'}</Btn></div>
      </form>
    </Sheet>
  );
}

function expiryLabel(iso) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'শেষ — নতুন লিংক বানান';
  const d = Math.floor(ms / 864e5), h = Math.floor((ms % 864e5) / 36e5);
  return d > 0 ? `আর ${toBnDigits(d)} দিন` : `আর ${toBnDigits(h)} ঘণ্টা`;
}

function AdminInvite({group}) {
  const [label,setLabel] = useState('');
  const [links,setLinks] = useState([]);
  const [busy,run] = useAction();
  const [ask,confirmNode] = useConfirm();
  const load = () => rpc('pending_access_links', {p_group:group.id});
  useEffect(() => {
    let active = true;
    run(async () => { const rows = await load(); if (active) setLinks(rows); });
    return () => { active = false; };
  }, [group.id]);
  const issue = () => run(async () => {
    await rpc('issue_access_link', {p_group:group.id,p_target:null,p_label:label});
    setLinks(await load()); setLabel('');
  });
  async function cancel(row) {
    if (!await ask({title:'লিংক বাতিল করবেন?',body:row.label,confirmText:'বাতিল করুন'})) return;
    run(async () => { await rpc('cancel_access_link', {p_group:group.id,p_token:row.token}); setLinks(await load()); });
  }
  return <section className="card stack"><h2>সদস্য যোগ করুন</h2>
    <p className="small muted">প্রতিটি লিংক একজন নতুন সদস্য একবার ব্যবহার করতে পারবেন।</p>
    <form onSubmit={e => { e.preventDefault(); issue(); }}>
      <Field label="সদস্যের নাম"><input type="text" required maxLength={100} placeholder="যেমন: নাসির" value={label} onChange={e => setLabel(e.target.value)} /></Field>
      <Btn busy={busy}>আমন্ত্রণ লিংক তৈরি করুন</Btn>
    </form>
    {links.map(row => {
      const link = window.location.origin + '/#/access/' + row.token;
      return <div className="stack" key={row.token}><strong>{row.label} · {row.purpose === 'join' ? 'আমন্ত্রণ' : 'নতুন ফোন'}</strong>
        {row.expires_at && <div className="small muted">মেয়াদ: {expiryLabel(row.expires_at)}</div>}
        <span className="small break">{link}</span><div className="btn-row">
          <Btn className="small" onClick={() => run(() => navigator.clipboard.writeText(link),'লিংক কপি হয়েছে।')}>লিংক কপি</Btn>
          <a className="btn small secondary" href={'https://wa.me/?text='+encodeURIComponent(group.name+' · '+link)} target="_blank" rel="noreferrer">WhatsApp</a>
          {navigator.share && <Btn className="small secondary" onClick={() => run(async () => {
            try { await navigator.share({title:group.name,url:link}); } catch(e) { if(e.name !== 'AbortError') throw e; }
          })}>শেয়ার করুন</Btn>}
          <Btn className="small ghost" busy={busy} onClick={() => cancel(row)}>লিংক বাতিল</Btn>
        </div></div>;
    })}{confirmNode}
  </section>;
}
