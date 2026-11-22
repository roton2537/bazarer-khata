import React, { useEffect, useState } from 'react';
import { supabase, configured } from './lib/supabase.js';
import { ToastProvider, Spinner } from './ui.jsx';
import { StoreProvider, useStore } from './store.jsx';
import { OfflineBanner } from './screens/Banners.jsx';
import { toBnDigits } from './lib/format.js';
import RecoveryGate from './screens/RecoveryGate.jsx';
import { AuthScreen, Onboarding, Welcome, Invite, Account, PasswordForm } from './screens/Entry.jsx';
import { AcceptLink, OpenLedger } from './screens/PhoneAccess.jsx';
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
  const [authError, setAuthError] = useState('');
  const hash = useHash();
  useEffect(() => {
    supabase.auth.getSession().then(({ data, error }) => { if (error) throw error; setSession(data.session || null); }).catch(() => { setAuthError('লগইন যাচাই করা যায়নি। নেটওয়ার্ক দেখে আবার চেষ্টা করুন।'); setSession(null); });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => { if (event === 'PASSWORD_RECOVERY') go('#/recover'); setSession(s || null); });
    return () => sub.subscription.unsubscribe();
  }, []);

  const query = new URLSearchParams(window.location.search);
  const invite = hash.match(/^#\/join\/([A-Za-z0-9]+)$/i)?.[1]?.toUpperCase();
  const emailIntent = query.get('continue');
  useEffect(() => {
    if (session === undefined || !emailIntent) return;
    const safe = /^(?:recover(?:\/create|\/join\/[A-Za-z0-9]+)?|create|join\/[A-Za-z0-9]+)$/.test(emailIntent);
    query.delete('continue');
    const url = new URL(window.location.href);
    url.search = query.toString();
    url.hash = safe ? '#/' + emailIntent : '#/';
    window.history.replaceState(null, '', url);
    window.dispatchEvent(new Event('hashchange'));
  }, [emailIntent, session]);

  if (session === undefined) return <div className="app no-nav center"><Spinner /></div>;
  if (authError) return <main className="app no-nav"><section className="card stack" role="alert"><h1>সংযোগে সমস্যা</h1><p>{authError}</p><button className="btn" onClick={() => window.location.reload()}>আবার চেষ্টা করুন</button></section></main>;
  if (emailIntent) return <Spinner />;
  const token = hash.match(/^#\/access\/([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i)?.[1];
  if (token) return <AcceptLink key={token} token={token} />;
  if (hash === '#/restore') return <OpenLedger signedIn={!!session} />;
  if (hash === '#/open' && !session) return <AuthScreen key="open" returning />;
  if (hash === '#/create') {
    if (!session?.user.email || session.user.is_anonymous) return <AuthScreen key="admin" create />;
    return <Onboarding user={session.user} />;
  }
  if (!session) {
    if (hash.startsWith('#/recover')) return <AuthScreen key="recover" initialMode="forgot" />;
    if (invite || ['#/create', '#/signin'].includes(hash)) return <AuthScreen key={hash} invite={invite} create={hash === '#/create'} />;
    return <Welcome key={hash} signedIn={false} />;
  }
  if (/^#\/recover(?:$|\/)/.test(hash)) return <PasswordForm next={hash.replace(/^#\/recover\/?/, '#/')} />;
  return <StoreProvider key={session.user.id} session={session}><Authed hash={hash} invite={invite} /></StoreProvider>;
}

function Authed({ hash, invite }) {
  const s = useStore();
  if (hash === '#/account') return <Account />;
  if (s.error && (!s.memberships || !s.data)) return <main className="app no-nav"><section className="card stack" role="alert"><h1>খাতা লোড করা যায়নি</h1><p>{s.error}</p><button className="btn" disabled={s.loading} onClick={() => s.refresh().catch(() => {})}>আবার চেষ্টা করুন</button><a href="#/account">আমার অ্যাকাউন্ট</a></section></main>;
  if (!s.memberships) return <div className="app no-nav center"><Spinner /></div>;
  if (invite) return <Invite key={invite} code={invite} />;
  if (!s.memberships.length && hash === '#/open') return <main className="kh-welcome kh-new">
    <header><img src="/icon.svg" alt="" width="32" height="32" />বাজারের খাতা</header>
    <section className="kh-new-body card stack"><h1>আমার খাতা</h1>
      <p>এই অ্যাকাউন্টে এখনও কোনো খাতা নেই। নতুন খাতা তৈরি করুন অথবা সদস্য হিসেবে অ্যাডমিনের আমন্ত্রণ লিংক খুলুন।</p>
      <a className="btn" href="#/create">নতুন খাতা তৈরি করুন</a>
      <a href="#/restore">রিকভারি কোড দিয়ে পুরোনো খাতা খুলুন</a>
      <a href="#/account">আমার অ্যাকাউন্ট</a>
    </section></main>;
  if (!s.memberships.length || hash === '#/new-group') return <Welcome signedIn />;
  if (!s.group || !s.data) return <Skeleton />;

  const r = hash === '#/open' || hash === '#/signin' ? '/' : hash.replace(/^#/, '') || '/';
  if (r === '/add') return <PurchaseForm />;
  if (r.startsWith('/edit/')) return <PurchaseForm editId={r.split('/')[2]} />;

  const pendingForMe = (s.data.report.payments || []).filter((p) => p.status === 'pending' && p.to === s.me?.id).length;
  const tabs = [
    ['/', 'home', 'হোম'], ['/list', 'basket', 'বাজার'], ['/report', 'report', 'রিপোর্ট', pendingForMe], ['/members', 'users', 'সদস্য'], ['/settings', 'gear', 'সেটিংস'],
  ];
  let body;
  if (r === '/list') body = <PurchaseList />;
  else if (r === '/report') body = <Report />;
  else if (r === '/feed') body = <Feed />;
  else if (r === '/members') body = <Members view="members" />;
  else if (r === '/settings') body = <Members view="settings" />;
  else body = <Home />;
  return (
    <>
      <div className="app">
        <a className={`bell${r === '/feed' ? ' on' : ''}`} href="#/feed" aria-label={s.unread ? `খবর, ${s.unread}টি নতুন` : 'খবর'}>
          <Icon name="bell" />{s.unread ? <span className="badge">{s.unread > 9 ? '৯+' : toBnDigits(s.unread)}</span> : null}
        </a>
        <OfflineBanner />
        {body}
      </div>
      {s.isAdmin && s.me && !s.me.recovery_saved_at ? <RecoveryGate /> : null}
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
