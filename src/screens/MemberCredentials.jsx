import { t } from '../lib/language.js';
import React, { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { captchaToken } from '../lib/captcha.js';
import { Btn, Field, useAction } from '../ui.jsx';

export const MEMBER_DOMAIN = '@members.bazarer-khata.invalid';

export function MemberCredentials({ onDone, legacy = false }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [credentialsSaved, setCredentialsSaved] = useState(false);
  const [busy, run] = useAction();
  if (legacy) return <main className="app no-nav"><section className="card stack">
    <h1>{t("পুরোনো সদস্যের লগইন")}</h1>
    <p>আগে যে ব্রাউজারে এই খাতায় প্রবেশ করেছিলেন, সেখানে সংরক্ষিত সেশন দিয়ে নিজের ইউজারনেম তৈরি করুন।</p>
    <Btn busy={busy} onClick={() => run(async () => {
      const project = new URL(import.meta.env.VITE_SUPABASE_URL).hostname.split('.')[0];
      // The old app stored Auth here. Only read it when the member chooses migration.
      const previous = JSON.parse(window.localStorage.getItem(`sb-${project}-auth-token`) || 'null');
      if (!previous?.user?.is_anonymous || !previous.refresh_token) throw new Error('আগের সদস্য সেশন পাওয়া যায়নি। মূল ব্রাউজারে এই পাতা খুলুন।');
      const {error} = await supabase.auth.setSession(previous);
      if (error) throw new Error('আগের সেশনে প্রবেশ করা যায়নি।');
      onDone();
    })}>{t("আগের সদস্য সেশন খুলুন")}</Btn>
    <a className="btn secondary" href="#/device-recovery">{t('পুরোনো সদস্যের খাতা ফেরত নিন')}</a>
    <a href="#/open">{t("ইউজারনেম দিয়ে প্রবেশ করুন")}</a>
  </section></main>;
  return <main className="app no-nav"><form className="card stack" onSubmit={e => {
    e.preventDefault();
    run(async () => {
      if (password !== confirmation) throw new Error(t("দুটি পিন মিলছে না।"));
      const email = username.trim().toLowerCase() + MEMBER_DOMAIN;
      if (!credentialsSaved) {
        const { error } = await supabase.functions.invoke('member-credentials', { body: { username, password } });
        if (error) throw new Error('লগইন তৈরি হয়নি। অন্য ইউজারনেম চেষ্টা করুন।');
        setCredentialsSaved(true);
      }
      const { data } = await supabase.auth.refreshSession();
      if (data?.session?.user?.email !== email) {
        const { error } = await supabase.auth.signInWithPassword({
          email, password, options: { captchaToken: await captchaToken() },
        });
        if (error) throw new Error(t("লগইন যাচাই করা যায়নি। নেটওয়ার্ক দেখে আবার চেষ্টা করুন।"));
      }
      onDone();
    });
  }}>
    <h1>{t("সদস্যের লগইন তৈরি করুন")}</h1>
    <p>{t("যেকোনো ফোনে এই ইউজারনেম ও পিন দিয়ে নিজের খাতায় ফিরতে পারবেন।")}</p>
    <Field label={t("ইউজারনেম")} hint={t("ইংরেজি অক্ষর, সংখ্যা বা আন্ডারস্কোর")}><input readOnly={credentialsSaved} required pattern="[A-Za-z0-9_]{3,32}" autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} /></Field>
    <Field label={t("পিন")} hint={t("৮ থেকে ১২টি সংখ্যা দিন।")}><input readOnly={credentialsSaved} required type="password" inputMode="numeric" pattern="[0-9]{8,12}" minLength={8} maxLength={12} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} /></Field>
    <Field label={t("পিন আবার লিখুন")}><input readOnly={credentialsSaved} required type="password" inputMode="numeric" pattern="[0-9]{8,12}" maxLength={12} autoComplete="new-password" value={confirmation} onChange={e => setConfirmation(e.target.value)} /></Field>
    <Btn busy={busy}>{t("লগইন সংরক্ষণ করুন")}</Btn>
  </form></main>;
}
