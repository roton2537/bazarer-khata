import React, { useEffect, useState } from 'react';
import { rpc, supabase, errText } from '../lib/supabase.js';
import { Btn, Field, useAction } from '../ui.jsx';

export async function deviceSession() {
  const current = await supabase.auth.getSession();
  if (current.error) throw current.error;
  if (current.data.session) return;
  const { error } = await supabase.auth.signInAnonymously();
  if (error) throw new Error(errText(error));
}

export function openLedger(id, page = '/') {
  localStorage.setItem('bk_gid', id);
  location.replace('#' + page);
  location.reload();
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
    <h1>{record?.group_name || 'বাজারের খাতা'}</h1>
    {error ? <p role="alert">{error}</p> : !record ? <p>লিংক যাচাই হচ্ছে…</p> :
      <form onSubmit={e => { e.preventDefault(); run(async () => {
        await deviceSession();
        openLedger(await rpc('accept_access_link', {p_token: token, p_name: name.trim()}), record.purpose === 'backup' ? '/members' : '/');
      }); }}>
        {record.purpose === 'join' ? <><p>আপনাকে এই খাতায় আমন্ত্রণ জানানো হয়েছে।</p>
          <Field label="আপনার নাম"><input required maxLength={100} value={name} onChange={e => setName(e.target.value)} /></Field></> :
          <p>{record.label} হিসেবে আগের হিসাব এই ডিভাইসে খুলবে। পুরোনো ডিভাইসের প্রবেশাধিকার সরবে।</p>}
        <Btn busy={busy}>{record.purpose === 'join' ? 'যোগ দিন' : 'আমার খাতা ফিরিয়ে আনুন'}</Btn>
      </form>}
    <a href="#/">শুরুতে ফিরুন</a>
  </section></main>;
}

export function OpenLedger({signedIn}) {
  const [code,setCode] = useState('');
  const [error,setError] = useState('');
  return <main className="app no-nav"><section className="card stack"><h1>আমার খাতা খুলুন</h1>
    {signedIn && <a href="#/">এই ডিভাইসের খাতায় ফিরুন</a>}
    <p>নতুন ফোনে সদস্য হলে অ্যাডমিনের পাঠানো প্রবেশের লিংক খুলুন। অ্যাডমিন হলে সংরক্ষিত রিকভারি কোড দিন।</p>
    <form onSubmit={e => {e.preventDefault(); const value = code.trim();
      if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value)) return setError('সম্পূর্ণ রিকভারি কোড দিন।');
      location.hash = '/access/' + value;
    }}><Field label="রিকভারি কোড"><input value={code} required onChange={e => setCode(e.target.value)} /></Field>
    {error && <p role="alert">{error}</p>}<Btn>খাতা খুলুন</Btn></form>
    {!signedIn && <a href="#/signin">আগের ইমেইল অ্যাকাউন্টে প্রবেশ করুন</a>}
  </section></main>;
}
