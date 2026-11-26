import React, { useEffect, useState } from 'react';
import { rpc } from '../lib/supabase.js';
import { useStore } from '../store.jsx';
import { Btn, Sheet, useAction, useToast } from '../ui.jsx';

// অ্যাডমিন রিকভারি কোড সংরক্ষণের কথা না জানানো পর্যন্ত এটি সরানো যায় না।
// কারণ: ফোন হারালে এই কোডই অ্যাডমিনের একমাত্র পথ।
export default function RecoveryGate() {
  const s = useStore(); const toast = useToast();
  const [code, setCode] = useState(null);
  const [saved, setSaved] = useState(false);
  const [busy, run] = useAction();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setCode(null);
    rpc('pending_access_links', { p_group: s.gid }).then((rows) => {
      if (alive) setCode(rows.find((r) => r.purpose === 'backup')?.token || '');
    }).catch((e) => { if (alive) { setCode(''); toast(e.message, true); } });
    return () => { alive = false; };
  }, [s.gid, attempt, toast]);
  const copy = async () => { try { await navigator.clipboard.writeText(code); toast('কোড কপি হয়েছে।'); } catch { toast('কপি হয়নি। কোডটি হাতে লিখে রাখুন।', true); } };
  const done = () => run(async () => { await rpc('ack_recovery', { p_group: s.gid }); await s.reloadGroup(); }, 'রিকভারি কোড সংরক্ষিত বলে জানানো হয়েছে।');
  return (
    <Sheet role="alertdialog" title="আপনার রিকভারি কোড সংরক্ষণ করুন">
        <p>ফোন হারালে বা ব্রাউজার মুছলে এই কোড দিয়েই আপনি অ্যাডমিন হিসেবে খাতা ফিরে পাবেন। কোড ছাড়া কেউ আপনাকে ফেরাতে পারবে না।</p>
        {code === null ? <p className="small muted">কোড আনা হচ্ছে…</p>
          : code ? <code className="break rg-code">{code}</code>
          : <div role="alert"><p>কোড আনা যায়নি।</p><button className="btn secondary" onClick={() => setAttempt(n => n + 1)}>আবার চেষ্টা করুন</button></div>}
        <div className="btn-row"><Btn className="secondary" disabled={!code} onClick={copy}>কোড কপি</Btn></div>
        <label className="rg-check"><input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
          <span>আমি কোডটি নিরাপদ জায়গায় (পাসওয়ার্ড ম্যানেজার বা নিজের কাছে) রেখেছি এবং কাউকে দেব না।</span></label>
        <Btn busy={busy} disabled={!saved || !code} onClick={done}>সংরক্ষণ করেছি, এগিয়ে যান</Btn>
    </Sheet>
  );
}
