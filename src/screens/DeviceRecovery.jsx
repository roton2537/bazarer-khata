import React, { useState } from 'react';
import { t } from '../lib/language.js';
import { rpc } from '../lib/supabase.js';
import { Btn, Field, useAction } from '../ui.jsx';
import { deviceSession, openLedger } from './PhoneAccess.jsx';

export function RecoverDevice() {
  const [code,setCode] = useState('');
  const [target,setTarget] = useState(null);
  const [busy,run] = useAction();
  const request = () => run(async () => {
    await deviceSession();
    setCode(await rpc('legacy_device_request'));
    setTarget(null);
  });
  const check = () => run(async () => {
    const approved = await rpc('legacy_device_status');
    if (!approved) throw new Error(t('অনুমোদন পাওয়া যায়নি। কোডের মেয়াদ শেষ হলে আবার কোড নিন।'));
    setTarget(approved);
  });
  return <main className="app no-nav"><section className="card stack">
    <h1>{t('পুরোনো সদস্যের খাতা ফেরত নিন')}</h1>
    <p>{t('নিজের নতুন ফোনে কোড নিন। গ্রুপের অ্যাডমিনকে সরাসরি কোড দেখিয়ে নিজের নামটি নিশ্চিত করুন।')}</p>
    {code && <div role="status"><strong>{code.match(/.{4}/g).join(' ')}</strong><p>{t('কোড ১০ মিনিট কার্যকর। এই পাতা খোলা রাখুন।')}</p></div>}
    {target ? <><p>{target.group_name} · <strong>{target.member_name}</strong></p>
      <Btn busy={busy} onClick={() => run(async () => openLedger(await rpc('claim_legacy_device')))}>{t('এটি আমার হিসাব — ফেরত নিন')}</Btn></> :
      <>{code && <Btn busy={busy} onClick={check}>{t('অনুমোদন দেখুন')}</Btn>}
      <Btn busy={busy} onClick={request}>{t('ফোনের কোড নিন')}</Btn></>}
    <a href="#/">{t('শুরুতে ফিরুন')}</a>
  </section></main>;
}

export function ApproveDevice({group,members}) {
  const [member,setMember] = useState('');
  const [code,setCode] = useState('');
  const [busy,run] = useAction();
  return <form className="card stack" onSubmit={e => {
    e.preventDefault();
    run(async () => {
      await rpc('approve_legacy_device',{p_group:group.id,p_member:member,p_code:code.replace(/\s/g,'')});
      setMember(''); setCode('');
    }, t('অনুমোদন হয়েছে। সদস্য নিজের ফোনে অনুমোদন দেখে পিন তৈরি করবেন।'));
  }}>
    <h2>{t('পুরোনো সদস্যের ফোন অনুমোদন')}</h2>
    <p>{t('সদস্যকে সরাসরি চিনে তাঁর ফোনের কোড মিলিয়ে নিন। যে সদস্যের এখনও ইউজারনেম নেই, তালিকায় তাঁর আগের নাম বাছুন।')}</p>
    <Field label={t('সদস্যের নাম')}><select required value={member} onChange={e => setMember(e.target.value)}>
      <option value="">{t('সদস্য বাছুন')}</option>
      {members.filter(m => m.role==='member' && !m.left_on).map(m => <option key={m.id} value={m.id}>{m.display_name}</option>)}
    </select></Field>
    <Field label={t('সদস্যের ফোনের কোড')}><input required value={code} maxLength={14} pattern="[A-Fa-f0-9]{4} ?[A-Fa-f0-9]{4} ?[A-Fa-f0-9]{4}" autoCapitalize="characters" autoComplete="off" spellCheck={false} onChange={e => setCode(e.target.value)}/></Field>
    <Btn busy={busy}>{t('এই ফোন অনুমোদন করুন')}</Btn>
  </form>;
}
