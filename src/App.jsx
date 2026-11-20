import React, { useEffect, useState } from 'react';
import { supabase, configured, rpc } from './lib/supabase.js';
import { ToastProvider, Spinner, useToast } from './ui.jsx';
import { StoreProvider, useStore } from './store.jsx';
import { AuthScreen, Onboarding } from './screens/Entry.jsx';
import Home from './screens/Home.jsx';
import { PurchaseList, PurchaseForm } from './screens/Purchases.jsx';
import Report from './screens/Report.jsx';
import Feed from './screens/Feed.jsx';
import Members from './screens/Members.jsx';
import { Icon, Skeleton } from './screens/parts.jsx';

export function useHash() {
  const [h, setH] = useState(window.location.hash || '#/');
  useEffect(() => { const f = () => setH(window.location.hash || '#/'); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);
  return h;
}
export const go = (path) => { window.location.hash = path; };

export default function App() {
  return (
    <ToastProvider>
      {configured ? <Root /> : <SetupMissing />}
    </ToastProvider>
  );
}

function SetupMissing() {
  return (
    <div className="app no-nav"><div className="brand"><h1>বাজারের খাতা</h1></div>
      <div className="banner red">Supabase সংযোগ সেট করা নেই। <code>VITE_SUPABASE_URL</code> ও <code>VITE_SUPABASE_ANON_KEY</code> পরিবেশ-ভেরিয়েবল দিয়ে আবার বিল্ড করুন।</div></div>
  );
}

function Root() {
  const [session, setSession] = useState(undefined);
  const hash = useHash();
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s || null));
    return () => sub.subscription.unsubscribe();
  }, []);

  // আমন্ত্রণের লিংক: কোডটি রেখে দিই, সাইন ইন শেষে সরাসরি গ্রুপে যোগ দেওয়ার জন্য
  const m = hash.match(/^#\/join\/([A-Za-z0-9]+)/);
  if (m) localStorage.setItem('bk_join', m[1].toUpperCase());

  if (session === undefined) return <div className="app no-nav center" style={{ paddingTop: 80 }}><Spinner /></div>;
  if (!session) return <AuthScreen />;
  return <StoreProvider session={session}><Authed hash={hash} /></StoreProvider>;
}

function Authed({ hash }) {
  const s = useStore();
  const toast = useToast();
  const [joining, setJoining] = useState(false);
  const pending = localStorage.getItem('bk_join');

  // সাইন ইন করা থাকলে এবং আমন্ত্রণ-কোড থাকলে স্বয়ংক্রিয়ভাবে যোগ দাও
  useEffect(() => {
    if (!pending || !s.memberships || joining) return;
    setJoining(true);
    (async () => {
      try {
        const g = await rpc('join_group', { p_code: pending, p_my_name: s.profile?.name || '' });
        localStorage.removeItem('bk_join');
        s.setGid(g); await s.refresh();
        toast('গ্রুপে যোগ দিয়েছেন।'); go('#/');
      } catch (e) { localStorage.removeItem('bk_join'); toast(e.message, true); go('#/'); }
      finally { setJoining(false); }
    })();
  }, [pending, s.memberships]); // eslint-disable-line

  if (!s.memberships || joining || pending) return <div className="app no-nav center" style={{ paddingTop: 80 }}><Spinner /><p className="muted">গ্রুপে যুক্ত করা হচ্ছে…</p></div>;
  if (s.memberships.length === 0 || hash === '#/new-group') return <Onboarding />;
  if (!s.group || !s.data) return <Skeleton />;

  const r = hash.replace(/^#/, '') || '/';
  if (r === '/add') return <PurchaseForm />;
  if (r.startsWith('/edit/')) return <PurchaseForm editId={r.split('/')[2]} />;

  const pendingForMe = (s.data.report.payments || []).filter((p) => p.status === 'pending' && p.to === s.me?.id).length;
  const tabs = [
    ['/', 'home', 'হোম'], ['/list', 'basket', 'বাজার'], ['/report', 'report', 'রিপোর্ট', pendingForMe], ['/feed', 'bell', 'খবর'], ['/members', 'users', 'সদস্য'],
  ];
  let body;
  if (r === '/list') body = <PurchaseList />;
  else if (r === '/report') body = <Report />;
  else if (r === '/feed') body = <Feed />;
  else if (r === '/members') body = <Members />;
  else body = <Home />;
  return (
    <>
      <div className="app">{body}</div>
      <nav className="nav" aria-label="প্রধান মেনু"><div className="nav-in">
        {tabs.map(([p, ic, label, badge]) => (
          <a key={p} href={`#${p}`} className={r === p || (p === '/' && r === '') ? 'on' : ''}>
            <Icon name={ic} />{label}{badge ? <span className="badge">{badge}</span> : null}
          </a>
        ))}
      </div></nav>
    </>
  );
}
