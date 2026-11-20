import React, { useEffect, useState } from 'react';
import { supabase, rpc, errText } from '../lib/supabase.js';
import { Btn, Field, useAction, useToast, useConfirm } from '../ui.jsx';
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

function emailReturn(intent) {
  const url = new URL('/', window.location.origin);
  if (intent) url.searchParams.set('continue', intent);
  return url.href;
}

export function Welcome({ signedIn }) {
  const [code, setCode] = useState('');
  return <main className="app no-nav"><Brand /><section className="card stack">
    <h2>কোন খাতায় যাবেন?</h2>
    <form onSubmit={e => { e.preventDefault(); go('#/join/' + code.trim().toUpperCase()); }}>
      <Field label="আমন্ত্রণ কোড"><input value={code} onChange={e => setCode(e.target.value.trim())} required pattern="[A-Za-z0-9]+" autoCapitalize="characters" /></Field>
      <Btn type="submit">আমন্ত্রণ কোড দিয়ে যোগ দিন</Btn>
    </form>
    <button className="btn secondary" onClick={() => go('#/create')}>নতুন খাতা খুলুন</button>
    <button className="btn ghost" onClick={() => go(signedIn ? '#/account' : '#/signin')}>{signedIn ? 'আমার অ্যাকাউন্ট' : 'আগের অ্যাকাউন্টে প্রবেশ করুন'}</button>
    {signedIn && location.hash === '#/new-group' && <a href="#/">আমার খাতায় ফিরুন</a>}
  </section></main>;
}

function useInviteName(code) {
  const [result, setResult] = useState({});
  const [attempt, retry] = useState(0);
  useEffect(() => {
    let active = true;
    if (code) {
      setResult({});
      rpc('group_name_by_code', { p_code: code }).then(name => {
        if (active) setResult(name ? {name} : {error: 'আমন্ত্রণ কোডটি আর কার্যকর নেই। নতুন কোড চাইতে পারেন।'});
      }).catch(err => { if (active) setResult({error: err.message}); });
    }
    return () => { active = false; };
  }, [code, attempt]);
  return {...result, retry: () => retry(n => n + 1)};
}

export function AuthScreen({ invite, create, initialMode }) {
  const [mode, setMode] = useState(initialMode || (create ? 'up' : 'in'));
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [pw, setPw] = useState('');
  const [info, setInfo] = useState('');
  const [busy, run] = useAction();
  const group = useInviteName(invite);
  const intent = invite ? 'join/' + invite : create ? 'create' : '';
  const switchMode = next => { setInfo(''); setPw(''); setMode(next); };
  const sendReset = async () => {
    const {error} = await supabase.auth.resetPasswordForEmail(email.trim(), {redirectTo: emailReturn(intent ? 'recover/' + intent : 'recover')});
    if (error) throw new Error(errText(error));
    setInfo('এই ইমেইলে অ্যাকাউন্ট থাকলে পাসওয়ার্ড বদলানোর লিংক পাবেন।');
  };
  const submit = (e) => {
    e.preventDefault(); setInfo('');
    run(async () => {
      if (mode === 'forgot') return sendReset();
      if (mode === 'up') {
        if (!name.trim()) throw new Error('আপনার নাম লিখুন।');
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password: pw, options: { emailRedirectTo: emailReturn(intent), data: { name: name.trim() } } });
        if (error) throw new Error(errText(error));
        if (!data.session) { setMode('verify'); setPw(''); setInfo('আপনার ইমেইলে একটি নিশ্চিতকরণ লিংক পাঠানো হয়েছে। লিংকে ক্লিক করে তারপর খাতায় ফিরে আসুন।'); }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw });
        if (error) throw new Error(errText(error));
      }
    });
  };

  return (
    <div className="app no-nav">
      <Brand />
      {invite && <div className="banner green">{group.name ? 'আমন্ত্রণ · ' + group.name : group.error || 'আমন্ত্রণ দেখা হচ্ছে…'}</div>}
      {create && <h2>নতুন খাতা খুলুন</h2>}
      {mode === 'verify' ? <section className="card stack"><h2>ইমেইল চেক করুন</h2><strong>{email}</strong><p role="status">{info}</p>
        <Btn busy={busy} onClick={() => run(async () => {
          const {error} = await supabase.auth.resend({type: 'signup', email: email.trim(), options: {emailRedirectTo: emailReturn(intent)}});
          if (error) throw new Error(errText(error));
          setInfo('নিশ্চিতকরণ ইমেইল আবার পাঠানো হয়েছে।');
        })}>আবার পাঠান</Btn><button className="btn secondary" onClick={() => switchMode('in')}>সাইন ইন করুন</button>
      </section> : <form className="card" style={{ marginTop: 16 }} onSubmit={submit}>
        {mode === 'forgot' ? <h2>পাসওয়ার্ড পুনরুদ্ধার</h2> : <div className="seg">
          <button type="button" className={mode === 'in' ? 'on' : ''} onClick={() => switchMode('in')}>সাইন ইন</button>
          <button type="button" className={mode === 'up' ? 'on' : ''} onClick={() => switchMode('up')}>নতুন অ্যাকাউন্ট</button>
        </div>}
        {mode === 'up' ? <Field label="আপনার নাম"><input type="text" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></Field> : null}
        <Field label="ইমেইল"><input type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></Field>
        {mode !== 'forgot' && <Field label="পাসওয়ার্ড" hint={mode === 'up' ? 'অন্তত ৬ অক্ষর' : undefined}>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete={mode === 'up' ? 'new-password' : 'current-password'} required minLength={6} />
        </Field>}
        {info ? <div className="banner green">{info}</div> : null}
        <div style={{ marginTop: 16 }}><Btn busy={busy} type="submit">{mode === 'up' ? 'অ্যাকাউন্ট খুলুন' : mode === 'forgot' ? 'লিংক পাঠান' : 'সাইন ইন'}</Btn></div>
        {mode === 'in' && <button className="btn ghost" type="button" onClick={() => switchMode('forgot')}>পাসওয়ার্ড ভুলে গেছেন?</button>}
        {mode === 'forgot' && <button className="btn ghost" type="button" onClick={() => switchMode('in')}>সাইন ইনে ফিরুন</button>}
      </form>}
      <a href="#/">শুরুতে ফিরুন</a>
    </div>
  );
}

export function Onboarding() {
  const s = useStore(); const toast = useToast();
  const [name, setName] = useState(''); const [cur, setCur] = useState('BDT');
  const [myName, setMyName] = useState(s.profile?.name || s.session.user.user_metadata?.name || '');
  const [busy, run] = useAction();

  const create = (e) => {
    e.preventDefault();
    run(async () => {
      const c = CURRENCIES.find((x) => x.code === cur);
      const id = await rpc('create_group', { p_name: name, p_currency_code: c.code, p_symbol: c.symbol, p_cname: c.name, p_cgen: c.gen, p_decimals: c.decimals, p_my_name: myName });
      s.setGid(id); await s.refresh(); toast('গ্রুপ তৈরি হয়েছে। আপনি এখন অ্যাডমিন।'); go('#/members');
    });
  };
  return (
    <div className="app no-nav">
      <Brand />
      <div className="card">
        <h2>নতুন খাতা খুলুন</h2>
          <form onSubmit={create}>
            <Field label="গ্রুপের নাম"><input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="যেমন: মেসের বাজার" required maxLength={60} /></Field>
            <Field label="মুদ্রা"><select value={cur} onChange={(e) => setCur(e.target.value)}>{CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.name} ({c.symbol})</option>)}</select></Field>
            <Field label="গ্রুপে আপনার নাম"><input type="text" value={myName} onChange={(e) => setMyName(e.target.value)} required /></Field>
            <p className="small muted">গ্রুপ তৈরি করলে আপনি অ্যাডমিন হবেন। পরে আমন্ত্রণের লিংক পাঠিয়ে সবাইকে যোগ করতে পারবেন।</p>
            <div style={{ marginTop: 12 }}><Btn busy={busy} type="submit">গ্রুপ তৈরি করুন</Btn></div>
          </form>
      </div>
      <a href="#/">ফিরে যান</a>
    </div>
  );
}


export function Invite({ code }) {
  const s = useStore();
  const group = useInviteName(code);
  const [busy, run] = useAction();
  const open = () => run(async () => {
    const id = await rpc('join_group', {p_code: code, p_my_name: s.profile?.name || ''});
    s.setGid(id); await s.refresh(); go('#/');
  });
  return <main className="app no-nav"><Brand /><section className="card stack">
    <h2>{group.name || 'খাতার আমন্ত্রণ'}</h2><p>{s.session.user.email}</p>
    {group.error ? <><p role="alert">{group.error}</p><button onClick={group.retry} className="btn secondary">আবার চেষ্টা করুন</button></> :
      <><p>আমন্ত্রিত ইমেইল দিয়ে যোগদান নিশ্চিত করুন। নতুন সদস্যের বাজারের ভাগ আজ থেকে ধরা হবে।</p>
      <Btn busy={busy} disabled={!group.name} onClick={open}>এই খাতায় যোগ দিন</Btn></>}
    <button className="btn secondary" onClick={() => run(async () => {const {error} = await supabase.auth.signOut({scope:'local'}); if (error) throw error;})}>অন্য অ্যাকাউন্ট ব্যবহার করুন</button>
    <a href="#/">এখন থাক</a>
  </section></main>;
}

export function PasswordForm({next}) {
  const [pw,setPw] = useState('');
  const [confirm,setConfirm] = useState('');
  const [busy,run] = useAction();
  return <main className="app no-nav"><form className="card stack" onSubmit={e => {
    e.preventDefault(); run(async () => {
      if (pw !== confirm) throw new Error('দুটি পাসওয়ার্ড মিলছে না।');
      const {error} = await supabase.auth.updateUser({password:pw});
      if (error) throw new Error(errText(error)); go(next);
    }, 'পাসওয়ার্ড বদলানো হয়েছে।');
  }}><h2>নতুন পাসওয়ার্ড দিন</h2>
    <Field label="নতুন পাসওয়ার্ড"><input required minLength={6} type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} /></Field>
    <Field label="পাসওয়ার্ড আবার লিখুন"><input required type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} /></Field>
    <Btn busy={busy}>পাসওয়ার্ড সংরক্ষণ করুন</Btn><a href="#/">ফিরে যান</a>
  </form></main>;
}

export function Account() {
  const s = useStore();
  const [ask,confirmNode] = useConfirm();
  const [busy,run] = useAction();
  const delAccount = async () => {
    const ok = await ask({ title: 'আপনার অ্যাকাউন্ট মুছবেন?',
      body: 'আপনার লগইন, ইমেইল ও নাম-পরিচয়ের সংযোগ মুছে যাবে। আপনি সব গ্রুপ থেকে বেরিয়ে যাবেন।\nগ্রুপের অন্যদের পুরোনো মাসের হিসাব ঠিক থাকবে; আপনার আগের বাজার ও দেনা-পাওনা আপনার নামেই ইতিহাসে দেখাবে।\nযে গ্রুপে আপনিই একমাত্র সদস্য, সেই গ্রুপটিও মুছে যাবে। আপনি যদি কোনো গ্রুপের একমাত্র অ্যাডমিন হন, আগে অন্য সদস্যকে দায়িত্ব দিতে হবে।\nএটি ফেরানো যাবে না।',
      confirmText: 'অ্যাকাউন্ট মুছুন', danger: true, requireText: 'মুছুন' });
    if (ok) run(async () => { await rpc('delete_my_account'); localStorage.removeItem('bk_gid'); await supabase.auth.signOut(); go('#/'); }, 'অ্যাকাউন্ট মুছে ফেলা হয়েছে।');
  };

  return <main className="app no-nav"><section className="card stack"><h2>আমার অ্যাকাউন্ট</h2>
    <p>{s.profile?.name}</p><p>{s.session.user.email}</p>
    <a className="btn secondary" href="#/recover">পাসওয়ার্ড বদলান</a>
    <Btn busy={busy} onClick={() => run(async () => {const {error} = await supabase.auth.signOut({scope:'local'}); if(error) throw error; go('#/');})}>সাইন আউট</Btn>
    <Btn busy={busy} className="danger secondary" onClick={delAccount}>আমার অ্যাকাউন্ট মুছে ফেলুন</Btn>
    <a href="#/">ফিরে যান</a></section>{confirmNode}</main>;
}
