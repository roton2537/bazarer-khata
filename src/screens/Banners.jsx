import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../store.jsx';
import { Btn } from '../ui.jsx';
import { queueState, flushQueue, dismissFailed } from '../lib/offline.js';
import { todayDhaka, monthOf, addMonths, monthLabel } from '../lib/format.js';

// অফলাইনে লেখা বাজার/পরিশোধ: কতগুলো অপেক্ষায় আছে, আর সার্ভার কোনগুলো ফিরিয়েছে
export function OfflineBanner() {
  const s = useStore();
  const [st, setSt] = useState(() => queueState(s.uid));
  const [syncError, setSyncError] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = () => setSt(queueState(s.uid));
  const flush = async () => { setBusy(true); setSyncError(''); try { const n = await flushQueue(s.uid); if (n) await s.reloadGroup(); } catch(e) { setSyncError(e.message); } finally { setBusy(false); refresh(); } };
  const latestFlush = useRef(flush);
  useEffect(() => { latestFlush.current = flush; });
  useEffect(() => {
    window.addEventListener('bk-queue', refresh);
    const online = () => latestFlush.current();
    window.addEventListener('online', online);
    if (navigator.onLine) online();
    return () => { window.removeEventListener('bk-queue', refresh); window.removeEventListener('online', online); };
  }, []);
  if (!st.pending.length && !st.failed.length && !st.legacy.length && !syncError) return null;
  return (
    <div className="queue-wrap" role="status">
      {syncError ? <div className="banner red">{syncError}</div> : null}
      {st.legacy.length > 0 ? <div className="banner red"><b>পুরোনো অফলাইন লেখা: {st.legacy.length}টি</b><p>অ্যাকাউন্ট যাচাই ছাড়া পুরোনো লেখা আর স্বয়ংক্রিয়ভাবে পাঠানো হবে না। এই ডিভাইসের পুরোনো খাতায় যাচাই করে প্রয়োজনে আবার লিখুন। পুরোনো সংরক্ষিত তথ্য মুছে ফেলা হয়নি।</p></div> : null}
      {st.pending.length > 0 && <div className="banner">
        <b>{st.pending.length}টি লেখা</b> এই ফোনে রাখা আছে, ইন্টারনেট এলে নিজে থেকে জমা হবে।
        <div className="btn-row"><Btn busy={busy} className="small secondary" onClick={flush}>এখনই চেষ্টা করুন</Btn></div>
      </div>}
      {st.failed.length > 0 && <div className="banner">
        <b>জমা হয়নি:</b>
        {st.failed.map((f, i) => <div key={i} className="small">{f.desc ? `“${f.desc}” — ` : ''}{f.reason}</div>)}
        <div className="btn-row"><button className="btn small secondary" onClick={() => dismissFailed(s.uid)}>বুঝেছি</button></div>
      </div>}
    </div>
  );
}

// অ্যাডমিনকে: আগের মাস সংশোধনের সময় পেরিয়েছে কিন্তু চূড়ান্ত হয়নি
export function LastMonthOpenBanner() {
  const s = useStore();
  if (!s.isAdmin) return null;
  const today = todayDhaka();
  const prev = addMonths(monthOf(today), -1);
  const row = s.data.months.find((m) => m.month === prev);
  const day = Number(today.slice(8, 10));
  if (!row || row.finalized || day < 3) return null;     // ১–২ তারিখ সংশোধনের সুযোগ চলে
  return <div className="banner"><b>{monthLabel(prev)}</b>-এর হিসাব এখনও চূড়ান্ত হয়নি। সংশোধনের সময় শেষ, এখন চূড়ান্ত করতে পারেন।
    <div className="btn-row"><button className="btn small" onClick={() => { s.setMonth(prev); location.hash = '#/report'; }}>রিপোর্টে যান</button></div></div>;
}

// নতুন সদস্যের জন্য ৩ ধাপের পরিচয় (একবারই)
export function Tour() {
  const s = useStore();
  const key = `bk_tour_${s.gid}`;
  const [gone, setGone] = useState(() => { try { return !!localStorage.getItem(key); } catch { return true; } });
  if (gone || !s.isActive) return null;
  const done = () => { try { localStorage.setItem(key, '1'); } catch { /* */ } setGone(true); };
  return (
    <div className="card stack tour">
      <h2>শুরু করার ৩ ধাপ</h2>
      <ol>
        <li><b>বাজার লিখুন:</b> কিনে এলে “+ বাজার লিখুন” চাপুন। টাকা সবার মধ্যে সমান ভাগ হয়ে যাবে।</li>
        <li><b>পরিশোধ লিখুন:</b> কাউকে টাকা দিলে রিপোর্টে “পরিশোধ লিখুন” চাপুন। তিনি নিশ্চিত করলে আপনার বাকি কমবে।</li>
        <li><b>ছুটিতে গেলে বিরতি দিন:</b> সেটিংস → “বিরতি দিন”। বিরতির দিনগুলোর বাজারের ভাগ আপনার ওপর পড়বে না।</li>
      </ol>
      <button className="btn small" onClick={done}>বুঝেছি</button>
    </div>
  );
}
