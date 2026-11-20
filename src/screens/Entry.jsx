import React, { useEffect, useState } from 'react';
import { supabase, rpc, errText } from '../lib/supabase.js';
import { Btn, Field, useAction, useToast } from '../ui.jsx';
import { CURRENCIES } from '../lib/format.js';
import { useStore } from '../store.jsx';
import { go } from '../App.jsx';

function Brand() {
  return (
    <div className="brand">
      <img className="logo" src="/icon.svg" alt="" />
      <h1>বাজারের খাতা</h1>
      <p className="muted">একসঙ্গে থাকলে বাজারের হিসাব সবার কাছে পরিষ্কার</p>
    </div>
  );
}

export function AuthScreen() {
  const [mode, setMode] = useState('in');
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [pw, setPw] = useState('');
  const [info, setInfo] = useState(''); const [groupName, setGroupName] = useState('');
  const [busy, run] = useAction();
  const code = localStorage.getItem('bk_join');
  useEffect(() => {
    if (code) supabase.rpc('group_name_by_code', { p_code: code }).then(({ data }) => setGroupName(data || ''));
  }, [code]);

  const submit = (e) => {
    e.preventDefault(); setInfo('');
    run(async () => {
      if (mode === 'up') {
        if (!name.trim()) throw new Error('আপনার নাম লিখুন।');
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password: pw, options: { data: { name: name.trim() } } });
        if (error) throw new Error(errText(error));
        if (!data.session) setInfo('আপনার ইমেইলে একটি নিশ্চিতকরণ লিংক পাঠানো হয়েছে। লিংকে ক্লিক করে তারপর সাইন ইন করুন।');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw });
        if (error) throw new Error(errText(error));
      }
    });
  };

  return (
    <div className="app no-nav">
      <Brand />
      {code ? <div className="banner green">{groupName ? <>আপনাকে <b>“{groupName}”</b> গ্রুপে যোগ দিতে আমন্ত্রণ জানানো হয়েছে।</> : 'আপনাকে একটি গ্রুপে যোগ দিতে আমন্ত্রণ জানানো হয়েছে।'} সাইন ইন করলেই সরাসরি যোগ দেবেন।</div> : null}
      <form className="card" style={{ marginTop: 16 }} onSubmit={submit}>
        <div className="seg" role="tablist">
          <button type="button" className={mode === 'in' ? 'on' : ''} onClick={() => setMode('in')}>সাইন ইন</button>
          <button type="button" className={mode === 'up' ? 'on' : ''} onClick={() => setMode('up')}>নতুন অ্যাকাউন্ট</button>
        </div>
        {mode === 'up' ? <Field label="আপনার নাম"><input type="text" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></Field> : null}
        <Field label="ইমেইল"><input type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></Field>
        <Field label="পাসওয়ার্ড" hint={mode === 'up' ? 'অন্তত ৬ অক্ষর' : undefined}>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete={mode === 'up' ? 'new-password' : 'current-password'} required minLength={6} />
        </Field>
        {info ? <div className="banner green">{info}</div> : null}
        <div style={{ marginTop: 16 }}><Btn busy={busy} type="submit">{mode === 'up' ? 'অ্যাকাউন্ট খুলুন' : 'সাইন ইন'}</Btn></div>
      </form>
    </div>
  );
}

export function Onboarding() {
  const s = useStore(); const toast = useToast();
  const [tab, setTab] = useState('new');
  const [name, setName] = useState(''); const [cur, setCur] = useState('BDT');
  const [myName, setMyName] = useState(s.profile?.name || ''); const [code, setCode] = useState('');
  const [busy, run] = useAction();
  const hasGroups = s.memberships && s.memberships.length > 0;

  const create = (e) => {
    e.preventDefault();
    run(async () => {
      const c = CURRENCIES.find((x) => x.code === cur);
      const id = await rpc('create_group', { p_name: name, p_currency_code: c.code, p_symbol: c.symbol, p_cname: c.name, p_cgen: c.gen, p_decimals: c.decimals, p_my_name: myName });
      s.setGid(id); await s.refresh(); toast('গ্রুপ তৈরি হয়েছে। আপনি এখন অ্যাডমিন।'); go('#/members');
    });
  };
  const join = (e) => {
    e.preventDefault();
    run(async () => {
      const id = await rpc('join_group', { p_code: code, p_my_name: myName });
      s.setGid(id); await s.refresh(); toast('গ্রুপে যোগ দিয়েছেন।'); go('#/');
    });
  };
  return (
    <div className="app no-nav">
      <Brand />
      <div className="card">
        <h2>শুরু করুন</h2>
        <p className="muted small">নতুন গ্রুপ খুলুন, অথবা বন্ধুর পাঠানো আমন্ত্রণ-কোড দিয়ে যোগ দিন।</p>
        <div className="seg" style={{ marginTop: 10 }}>
          <button type="button" className={tab === 'new' ? 'on' : ''} onClick={() => setTab('new')}>নতুন গ্রুপ</button>
          <button type="button" className={tab === 'join' ? 'on' : ''} onClick={() => setTab('join')}>কোড আছে</button>
        </div>
        {tab === 'new' ? (
          <form onSubmit={create}>
            <Field label="গ্রুপের নাম"><input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="যেমন: মেসের বাজার" required maxLength={60} /></Field>
            <Field label="মুদ্রা"><select value={cur} onChange={(e) => setCur(e.target.value)}>{CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.name} ({c.symbol})</option>)}</select></Field>
            <Field label="গ্রুপে আপনার নাম"><input type="text" value={myName} onChange={(e) => setMyName(e.target.value)} required /></Field>
            <p className="small muted">গ্রুপ তৈরি করলে আপনি অ্যাডমিন হবেন। পরে আমন্ত্রণের লিংক পাঠিয়ে সবাইকে যোগ করতে পারবেন।</p>
            <div style={{ marginTop: 12 }}><Btn busy={busy} type="submit">গ্রুপ তৈরি করুন</Btn></div>
          </form>
        ) : (
          <form onSubmit={join}>
            <Field label="আমন্ত্রণ-কোড"><input type="text" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} autoCapitalize="characters" autoComplete="off" required /></Field>
            <Field label="গ্রুপে আপনার নাম"><input type="text" value={myName} onChange={(e) => setMyName(e.target.value)} required /></Field>
            <div style={{ marginTop: 12 }}><Btn busy={busy} type="submit">গ্রুপে যোগ দিন</Btn></div>
          </form>
        )}
      </div>
      {hasGroups ? <div style={{ marginTop: 12 }}><button className="btn secondary" onClick={() => go('#/')}>← ফিরে যান</button></div> : (
        <div style={{ marginTop: 12 }}><button className="btn ghost" onClick={() => supabase.auth.signOut()}>সাইন আউট</button></div>)}
    </div>
  );
}
