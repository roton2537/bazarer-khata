import React, { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { Btn, Field, useAction } from '../ui.jsx';

export const MEMBER_DOMAIN = '@members.bazarer-khata.invalid';

export function MemberCredentials({ onDone }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, run] = useAction();
  return <main className="app no-nav"><form className="card stack" onSubmit={e => {
    e.preventDefault();
    run(async () => {
      const {error} = await supabase.functions.invoke('member-credentials', {body:{username,password}});
      if (error) throw new Error('লগইন তৈরি হয়নি। অন্য ইউজারনেম চেষ্টা করুন।');
      const result = await supabase.auth.refreshSession();
      if (result.error) throw new Error('লগইন তৈরি হয়েছে। নতুন ইউজারনেম ও পাসওয়ার্ড দিয়ে প্রবেশ করুন।');
      onDone();
    });
  }}>
    <h1>সদস্যের লগইন তৈরি করুন</h1>
    <p>পরের বার এই ইউজারনেম ও পাসওয়ার্ড দিয়ে একই খাতায় ফিরবেন।</p>
    <Field label="ইউজারনেম" hint="ইংরেজি অক্ষর, সংখ্যা বা আন্ডারস্কোর"><input required pattern="[A-Za-z0-9_]{3,32}" autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} /></Field>
    <Field label="পাসওয়ার্ড"><input required type="password" minLength={8} maxLength={72} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} /></Field>
    <Btn busy={busy}>লগইন সংরক্ষণ করুন</Btn>
  </form></main>;
}
