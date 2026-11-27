import { LanguagePicker } from './parts.jsx';
import { t } from '../lib/language.js';
import { MEMBER_DOMAIN } from './MemberCredentials.jsx';
import { captchaToken } from '../lib/captcha.js';
import React, { useEffect, useState } from 'react';
import { supabase, rpc, errText } from '../lib/supabase.js';
import { Btn, Field, useAction, useConfirm } from '../ui.jsx';
import { CURRENCIES } from '../lib/format.js';
import { useStore } from '../store.jsx';
import { openLedger } from './PhoneAccess.jsx';
import './welcome.css';
import { go } from '../App.jsx';

function Brand() {
  return (
    <div className="brand"><LanguagePicker />
      <img className="logo" src="/icon.svg" alt="" />
      <h1 className="khai-wordmark">KHAI KHAI</h1><p className="khai-entry-label">{t("বাজারের খাতা")}</p>
      <p className="muted">{t("একসঙ্গে থাকলে বাজারের হিসাব সবার কাছে পরিষ্কার")}</p>
    </div>
  );
}

function emailReturn(intent) {
  const url = new URL('/', window.location.origin);
  if (intent) url.searchParams.set('continue', intent);
  return url.href;
}

export function Welcome({ signedIn }) {
  return <main className="kh-welcome"><LanguagePicker />
    <header><img src="/icon.svg" alt="" width="32" height="32" /><strong className="khai-entry-mark">KHAI KHAI</strong><span className="khai-entry-label">{t("বাজারের খাতা")}</span></header>
    <div className="kh-layout">
      <div className="kh-art" aria-hidden="true"><div className="kh-cover" /><div className="kh-slip"><strong>{t("বাজারের খাতা")}</strong></div></div>
      <section className="kh-intro">
        <h1>{t("সবার বাজার,")}<br/><em>{t("এক খাতায়।")}</em></h1>
        <p>{t("কে কত টাকার বাজার করলেন, আর কার ভাগে কত পড়ল—একসঙ্গে হিসাব রাখুন।")}</p>
        <nav aria-label={t("খাতা খুলুন")}>
          <a className="kh-create" href="#/create">{t("নতুন খাতা তৈরি করুন ")}<span aria-hidden="true">→</span></a>
          <a href={signedIn && location.hash === '#/new-group' ? '#/' : '#/open'}>{t("আমার খাতা খুলুন")}</a>
          <a href="#/restore">{t("আমন্ত্রণ টোকেন দিয়ে যোগ দিন")}</a>
          {!signedIn && <a href="#/member-setup">{t("পুরোনো সদস্যের লগইন তৈরি করুন")}</a>}
        </nav>
        <aside>{t("সদস্য হিসেবে যোগ দিতে অ্যাডমিনের পাঠানো লিংক খুলুন।")}</aside>
      </section>
    </div>
  </main>;
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

export function AuthScreen({ invite, create, returning, initialMode }) {
  const [mode, setMode] = useState(initialMode || 'in');
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [pw, setPw] = useState('');
  const [info, setInfo] = useState('');
  const [busy, run] = useAction();
  const group = useInviteName(invite);
  const intent = invite ? 'join/' + invite : create ? 'create' : '';
  const switchMode = next => { setInfo(''); setPw(''); setMode(next); };
  const sendReset = async () => {
    const {error} = await supabase.auth.resetPasswordForEmail(email.trim(), {captchaToken: await captchaToken(), redirectTo: emailReturn(intent ? 'recover/' + intent : 'recover')});
    if (error) throw new Error(errText(error));
    setInfo('এই ইমেইলে অ্যাকাউন্ট থাকলে পাসওয়ার্ড বদলানোর লিংক পাবেন।');
  };
  const submit = (e) => {
    e.preventDefault(); setInfo('');
    run(async () => {
      if (mode === 'forgot') return sendReset();
      if (mode === 'up') {
        if (!name.trim()) throw new Error('আপনার নাম লিখুন।');
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password: pw, options: { captchaToken: await captchaToken(), emailRedirectTo: emailReturn(intent), data: { name: name.trim() } } });
        if (error) throw new Error(errText(error));
        if (!data.session) { setMode('verify'); setPw(''); setInfo('আপনার ইমেইলে একটি নিশ্চিতকরণ লিংক পাঠানো হয়েছে। লিংকে ক্লিক করে তারপর খাতায় ফিরে আসুন।'); }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: returning && !email.includes('@') ? email.trim().toLowerCase() + MEMBER_DOMAIN : email.trim(), password: pw, options: { captchaToken: await captchaToken() } });
        if (error) throw new Error(errText(error));
      }
    });
  };

  return (
    <main className={(create || returning) ? 'kh-welcome kh-new kh-admin' : 'app no-nav'}>
      {(create || returning) ? <header><img src="/icon.svg" alt="" width="32" height="32" /><strong className="khai-entry-mark">KHAI KHAI</strong><a href="#/">{t("← ফিরে যান")}</a></header> : <Brand />}
      <div className={(create || returning) ? 'kh-new-body' : undefined}>
      {invite && <div className="banner green">{group.name ? 'আমন্ত্রণ · ' + group.name : group.error || 'আমন্ত্রণ দেখা হচ্ছে…'}</div>}
      {returning && <><h1>{t("আমার খাতা খুলুন")}</h1><p className="kh-admin-intro">{t("সদস্য হলে ইউজারনেম, অ্যাডমিন হলে ইমেইল দিয়ে প্রবেশ করুন।")}</p></>}
      {create && <><h1>{t("আপনার অ্যাকাউন্ট")}</h1><p className="kh-admin-intro">{t("নতুন খাতা খুলতে অ্যাকাউন্ট তৈরি করুন অথবা আপনার অ্যাকাউন্টে সাইন ইন করুন।")}</p></>}
      {mode === 'verify' ? <section className="card stack"><h2>{t("ইমেইল চেক করুন")}</h2><strong>{email}</strong><p role="status">{info}</p>
        <Btn busy={busy} onClick={() => run(async () => {
          const {error} = await supabase.auth.resend({type: 'signup', email: email.trim(), options: {emailRedirectTo: emailReturn(intent)}});
          if (error) throw new Error(errText(error));
          setInfo('নিশ্চিতকরণ ইমেইল আবার পাঠানো হয়েছে।');
        })}>{t("আবার পাঠান")}</Btn><button className="btn secondary" onClick={() => switchMode('in')}>{t("সাইন ইন করুন")}</button>
      </section> : <form className="card" style={{ marginTop: 16 }} onSubmit={submit}>
        {mode === 'forgot' ? <h2>{t("পাসওয়ার্ড পুনরুদ্ধার")}</h2> : returning ? null : <div className="seg">
          <button type="button" className={mode === 'in' ? 'on' : ''} onClick={() => switchMode('in')}>{t("সাইন ইন")}</button>
          <button type="button" className={mode === 'up' ? 'on' : ''} onClick={() => switchMode('up')}>{t("নতুন অ্যাকাউন্ট")}</button>
        </div>}
        {mode === 'up' ? <Field label={t("আপনার নাম")}><input type="text" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required /></Field> : null}
        <Field label={returning && mode === 'in' ? t("ইউজারনেম বা ইমেইল") : t("ইমেইল")}><input type={returning && mode === 'in' ? "text" : "email"} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete={returning ? "username" : "email"} required /></Field>
        {mode !== 'forgot' && <Field label={t("পাসওয়ার্ড")} hint={mode === 'up' ? t("অন্তত ৬ অক্ষর") : undefined}>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete={mode === 'up' ? 'new-password' : 'current-password'} required minLength={6} />
        </Field>}
        {info ? <div className="banner green">{info}</div> : null}
        <div style={{ marginTop: 16 }}><Btn busy={busy} type="submit">{mode === 'up' ? (create ? t("অ্যাকাউন্ট তৈরি করুন") : t("অ্যাকাউন্ট খুলুন")) : mode === 'forgot' ? t("লিংক পাঠান") : t("সাইন ইন")}</Btn></div>
        {mode === 'in' && <button className="btn ghost" type="button" onClick={() => switchMode('forgot')}>{t("পাসওয়ার্ড ভুলে গেছেন?")}</button>}
        {mode === 'forgot' && <button className="btn ghost" type="button" onClick={() => switchMode('in')}>{t("সাইন ইনে ফিরুন")}</button>}
      </form>}
      {returning && <div className="return-help"><a href="#/restore">{t("সদস্যের আমন্ত্রণ টোকেন দিন")}</a><p>আমন্ত্রিত সদস্য হলে নতুন ফোনে অ্যাডমিনের পাঠানো প্রবেশের লিংক খুলুন।</p></div>}
      {!returning && !create && <a href="#/">{t("শুরুতে ফিরুন")}</a>}
      </div>
    </main>
  );
}

export function Onboarding({user}) {
  const [name, setName] = useState(''); const [cur, setCur] = useState('BDT');
  const [myName, setMyName] = useState(user.user_metadata?.name || '');
  const [busy, run] = useAction();

  const create = (e) => {
    e.preventDefault();
    run(async () => {
      const c = CURRENCIES.find((x) => x.code === cur);
      const id = await rpc('create_group', { p_name: name, p_currency_code: c.code, p_symbol: c.symbol, p_cname: c.name, p_cgen: c.gen, p_decimals: c.decimals, p_my_name: myName });
      openLedger(id, '/members');
    });
  };
  return <main className="kh-welcome kh-new">
    <header><img src="/icon.svg" alt="" width="32" height="32" /><strong className="khai-entry-mark">KHAI KHAI</strong>
      <a href="#/">{t("← ফিরে যান")}</a>
    </header>
    <div className="kh-new-body">
      <h1>{t("নতুন খাতা তৈরি করুন")}</h1>
      <div className="kh-book" aria-hidden="true">
        <span className="kh-book-title">{name.trim() || t("আপনার বাজারের খাতা")}</span>
        <span className="kh-book-by">{myName.trim() || t("অ্যাডমিন")} · {cur}</span>
      </div>
      <form onSubmit={create}>
        <Field label={t("খাতার নাম")}><input required pattern={'.*\\S.*'} maxLength={60} placeholder={t("যেমন: রিয়াদের বাজার")} value={name} onChange={e => setName(e.target.value)} /></Field>
        <Field label={t("আপনার নাম")}><input required pattern={'.*\\S.*'} autoComplete="name" placeholder={t("যে নামে সদস্যরা আপনাকে চিনবেন")} value={myName} onChange={e => setMyName(e.target.value)} /></Field>
        <Field label={t("হিসাবের মুদ্রা")}><select value={cur} onChange={e => setCur(e.target.value)}>{CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.name} ({c.code})</option>)}</select></Field>
        <p>{t("আপনি এই খাতার অ্যাডমিন হবেন। খাতা তৈরির পর সদস্যদের আমন্ত্রণ জানাতে পারবেন।")}</p>
        <Btn busy={busy} type="submit">{t("খাতা তৈরি করুন ")}<span aria-hidden="true">→</span></Btn>
      </form>
    </div>
  </main>;
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
    <h2>{group.name || t("খাতার আমন্ত্রণ")}</h2><p>{s.session.user.email?.replace(MEMBER_DOMAIN,'')}</p>
    {group.error ? <><p role="alert">{group.error}</p><button onClick={group.retry} className="btn secondary">{t("আবার চেষ্টা করুন")}</button></> :
      <><p>আমন্ত্রিত ইমেইল দিয়ে যোগদান নিশ্চিত করুন। নতুন সদস্যের বাজারের ভাগ আজ থেকে ধরা হবে।</p>
      <Btn busy={busy} disabled={!group.name} onClick={open}>{t("এই খাতায় যোগ দিন")}</Btn></>}
    <button className="btn secondary" onClick={() => run(async () => {const {error} = await supabase.auth.signOut({scope:'local'}); if (error) throw error;})}>{t("অন্য অ্যাকাউন্ট ব্যবহার করুন")}</button>
    <a href="#/">{t("এখন থাক")}</a>
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
  }}><h2>{t("নতুন পাসওয়ার্ড দিন")}</h2>
    <Field label={t("নতুন পাসওয়ার্ড")}><input required minLength={6} type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} /></Field>
    <Field label={t("পাসওয়ার্ড আবার লিখুন")}><input required type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} /></Field>
    <Btn busy={busy}>{t("পাসওয়ার্ড সংরক্ষণ করুন")}</Btn><a href="#/">{t("ফিরে যান")}</a>
  </form></main>;
}

export function Account() {
  const s = useStore();
  const [ask,confirmNode] = useConfirm();
  const [busy,run] = useAction();
  const delAccount = async () => {
    const ok = await ask({ title: t("আপনার অ্যাকাউন্ট মুছবেন?"),
      body: 'আপনার লগইন, ইমেইল ও নাম-পরিচয়ের সংযোগ মুছে যাবে। আপনি সব গ্রুপ থেকে বেরিয়ে যাবেন।\nগ্রুপের অন্যদের পুরোনো মাসের হিসাব ঠিক থাকবে; আপনার আগের বাজার ও দেনা-পাওনা আপনার নামেই ইতিহাসে দেখাবে।\nযে গ্রুপে আপনিই একমাত্র সদস্য, সেই গ্রুপটিও মুছে যাবে। আপনি যদি কোনো গ্রুপের একমাত্র অ্যাডমিন হন, আগে অন্য সদস্যকে দায়িত্ব দিতে হবে।\nএটি ফেরানো যাবে না।',
      confirmText: t("অ্যাকাউন্ট মুছুন"), danger: true, requireText: t("মুছুন") });
    if (ok) run(async () => { await rpc('delete_my_account'); await supabase.auth.signOut(); go('#/'); }, 'অ্যাকাউন্ট মুছে ফেলা হয়েছে।');
  };

  return <main className="app no-nav"><section className="card stack"><h2>{t("আমার অ্যাকাউন্ট")}</h2>
    <p>{s.profile?.name}</p><p>{s.session.user.email?.replace(MEMBER_DOMAIN,'')}</p>
    {s.session.user.email && <a className="btn secondary" href="#/recover">{t("পাসওয়ার্ড বদলান")}</a>}
    {!s.session.user.email && <AddEmail />}
    <Btn busy={busy} onClick={() => run(async () => {const {error} = await supabase.auth.signOut({scope:'local'}); if(error) throw error; go('#/');})}>{t("সাইন আউট")}</Btn>
    <Btn busy={busy} className="danger secondary" onClick={delAccount}>{t("আমার অ্যাকাউন্ট মুছে ফেলুন")}</Btn>
    <a href="#/">{t("ফিরে যান")}</a></section>{confirmNode}</main>;
}

// ইমেইল ছাড়া (লিংকে যোগ দেওয়া) সদস্য নিজেই অ্যাকাউন্ট সুরক্ষিত করতে পারেন:
// ফোন হারালেও ইমেইল ও পাসওয়ার্ডে সাইন ইন করে খাতা ফেরত পাবেন।
function AddEmail() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, run] = useAction();
  if (sent) return <p className="banner green">{email.trim()} ঠিকানায় একটি লিংক গেছে। লিংকে ক্লিক করে ইমেইল নিশ্চিত করুন, তারপর এই পাতায় ফিরে “পাসওয়ার্ড দিন” চাপুন।</p>;
  return <form className="stack" onSubmit={(e) => { e.preventDefault();
    run(async () => { const { error } = await supabase.auth.updateUser({ email: email.trim() }, { emailRedirectTo: window.location.origin + '/#/account' }); if (error) throw new Error(errText(error)); setSent(true); }); }}>
    <h3>{t("অ্যাকাউন্ট সুরক্ষিত করুন")}</h3>
    <p className="small muted">এখন আপনি ইমেইল ছাড়া ঢুকেছেন। ইমেইল যোগ করলে ফোন হারালেও অ্যাডমিনের সাহায্য ছাড়াই খাতা ফিরে পাবেন।</p>
    <Field label={t("আপনার ইমেইল")}><input required type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
    <Btn busy={busy} className="secondary">{t("ইমেইল যোগ করুন")}</Btn>
  </form>;
}
