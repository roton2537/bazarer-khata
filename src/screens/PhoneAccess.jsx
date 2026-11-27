import { t } from '../lib/language.js';
import { captchaToken as captchaToken_ } from '../lib/captcha.js';
import React, { useEffect, useState } from 'react';
import { rpc, supabase, errText } from '../lib/supabase.js';
import { Btn, Field, useAction } from '../ui.jsx';

export async function deviceSession() {
  const current = await supabase.auth.getSession();
  if (current.error) throw current.error;
  if (current.data.session) return;
  const captchaToken = await captchaToken_();
  const { error } = await supabase.auth.signInAnonymously(captchaToken ? { options: { captchaToken } } : undefined);
  if (error) throw new Error(errText(error));
}

export function openLedger(id, page = '/') {
  const url = new URL('/', location.origin);
  url.searchParams.set('ledger', id);
  url.hash = page;
  location.replace(url.href);
}

export function AcceptLink({ token }) {
  const [record, setRecord] = useState(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, run] = useAction();
  useEffect(() => {
    let active = true;
    rpc('preview_access_link', {p_token: token}).then(row => {
      if (!active) return;
      if (!row) return setError('এই লিংকটি ব্যবহৃত বা বাতিল হয়েছে। অ্যাডমিনের কাছে নতুন লিংক চান।');
      setRecord(row); setName(row.label);
    }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [token]);
  return <main className="app no-nav"><section className="card stack">
    <h1>{record?.group_name || "MessMate"}</h1>
    {error ? <p role="alert">{error}</p> : !record ? <p>{t("লিংক যাচাই হচ্ছে…")}</p> :
      <form onSubmit={e => { e.preventDefault(); run(async () => {
        await deviceSession();
        openLedger(await rpc('accept_access_link', {p_token: token, p_name: name.trim()}), record.purpose === 'backup' ? '/members' : '/');
      }); }}>
        {record.purpose === 'join' ? <><p>{t("আপনাকে এই খাতায় আমন্ত্রণ জানানো হয়েছে।")}</p>
          <Field label={t("আপনার নাম")}><input type="text" required maxLength={100} autoComplete="name" value={name} onChange={e => setName(e.target.value)} /></Field></> :
          <p>{record.label} হিসেবে আগের হিসাব এই ডিভাইসে খুলবে। পুরোনো ডিভাইসের প্রবেশাধিকার সরবে।</p>}
        <Btn busy={busy}>{record.purpose === 'join' ? t("যোগ দিন") : t("আমার খাতা ফিরিয়ে আনুন")}</Btn>
      </form>}
    <a href="#/">{t("শুরুতে ফিরুন")}</a>
  </section></main>;
}

export function OpenLedger({signedIn}) {
  const [code,setCode] = useState('');
  const [error,setError] = useState('');
  return <main className="app no-nav"><section className="card stack"><h1>{t("আমার খাতা খুলুন")}</h1>
    {signedIn && <a href="#/">{t("এই ডিভাইসের খাতায় ফিরুন")}</a>}
    <p>{t("সদস্য হিসেবে যোগ দিতে অ্যাডমিনের পাঠানো একবার ব্যবহারযোগ্য টোকেন দিন।")}</p>
    <form onSubmit={e => {e.preventDefault(); const value = code.trim();
      if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value)) return setError(t("সম্পূর্ণ আমন্ত্রণ টোকেন দিন।"));
      location.hash = '/access/' + value;
    }}><Field label={t("আমন্ত্রণ টোকেন")}><input type="text" value={code} required autoComplete="off" onChange={e => setCode(e.target.value)} /></Field>
    {error && <p role="alert">{error}</p>}<Btn>{t("খাতা খুলুন")}</Btn></form>
    {!signedIn && <a href="#/signin">{t("আগের ইমেইল অ্যাকাউন্টে প্রবেশ করুন")}</a>}
  </section></main>;
}
