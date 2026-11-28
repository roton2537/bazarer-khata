import { LanguageContext, setCurrentLanguage, t } from './lib/language.js';
import { MemberCredentials, MEMBER_DOMAIN } from './screens/MemberCredentials.jsx';
import React, { useEffect, useState } from 'react';
import { supabase, configured } from './lib/supabase.js';
import { ToastProvider, Spinner } from './ui.jsx';
import { StoreProvider, useStore } from './store.jsx';
import { monthOf, todayDhaka, toBnDigits } from './lib/format.js';
import { AuthScreen, Onboarding, Welcome, Invite, Account, PasswordForm } from './screens/Entry.jsx';
import { AcceptLink, OpenLedger } from './screens/PhoneAccess.jsx';
import GroupChat from './screens/GroupChat.jsx';
import Home from './screens/Home.jsx';
import { PurchaseList, PurchaseForm } from './screens/Purchases.jsx';
import Report from './screens/Report.jsx';
import Feed from './screens/Feed.jsx';
import { RecoverDevice } from './screens/DeviceRecovery.jsx';
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
    <div className="app no-nav"><div className="brand"><h1>MessMate</h1></div>
      <div className="banner red">Supabase সংযোগ সেট করা নেই। <code>VITE_SUPABASE_URL</code> ও <code>VITE_SUPABASE_ANON_KEY</code> পরিবেশ-ভেরিয়েবল দিয়ে আবার বিল্ড করুন।</div></div>
  );
}

function Root() {
  const [session, setSession] = useState(undefined);
  const [guestLanguage,setGuestLanguage] = useState('bn');
  const language = session ? (session.user.user_metadata?.language === 'en' ? 'en' : 'bn') : guestLanguage;
  setCurrentLanguage(language);
  useEffect(()=>{document.documentElement.lang=language;},[language]);
  const setLanguage = async value => {
    if(session){const {data,error}=await supabase.auth.updateUser({data:{language:value}});if(error)throw error;setSession(old=>old?.user.id===data.user.id ? {...old,user:data.user} : old);}
    else setGuestLanguage(value);
  };
  const [authError, setAuthError] = useState('');
  const hash = useHash();
  useEffect(() => {
    supabase.auth.getSession().then(({ data, error }) => { if (error) throw error; setSession(data.session || null); }).catch(() => { setAuthError(t("লগইন যাচাই করা যায়নি। নেটওয়ার্ক দেখে আবার চেষ্টা করুন।")); setSession(null); });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => { if (event === 'PASSWORD_RECOVERY') go('#/recover'); setSession(s || null); });
    return () => sub.subscription.unsubscribe();
  }, []);

  return <LanguageContext.Provider value={{language,setLanguage}}><Routes key={language} session={session} authError={authError} hash={hash} /></LanguageContext.Provider>;
}

function Routes({session,authError,hash}){
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
  if (authError) return <main className="app no-nav"><section className="card stack" role="alert"><h1>{t("সংযোগে সমস্যা")}</h1><p>{authError}</p><button className="btn" onClick={() => window.location.reload()}>{t("আবার চেষ্টা করুন")}</button></section></main>;
  if (emailIntent) return <Spinner />;
  const token = hash.match(/^#\/access\/([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i)?.[1];
  if (hash === '#/device-recovery') return <RecoverDevice />;
  if (token) return <AcceptLink key={token} token={token} />;
  if (hash === '#/restore') return <OpenLedger signedIn={!!session} />;
  if (hash === '#/open' && !session) return <AuthScreen key="open" returning />;
  if (hash === '#/create') {
    if (!session?.user.email || session.user.is_anonymous || session.user.email.endsWith(MEMBER_DOMAIN)) return <AuthScreen key="admin" create />;
    return <Onboarding user={session.user} />;
  }
  if (!session) {
    if (hash === '#/member-setup') return <MemberCredentials legacy onDone={() => go('#/')} />;
    if (hash.startsWith('#/recover')) return <AuthScreen key="recover" initialMode="forgot" />;
    if (invite || ['#/create', '#/signin'].includes(hash)) return <AuthScreen key={hash} invite={invite} create={hash === '#/create'} />;
    return <Welcome key={hash} signedIn={false} />;
  }
  if (/^#\/recover(?:$|\/)/.test(hash)) return <PasswordForm next={hash.replace(/^#\/recover\/?/, '#/')} />;
  return <StoreProvider key={session.user.id} session={session}><Authed hash={hash} invite={invite} /></StoreProvider>;
}

function Authed({ hash, invite }) {
  const s = useStore();
  if (s.memberships?.some(m => !m.left_on && m.role === 'member') && !s.session.user.email) return <MemberCredentials onDone={() => go('#/')} />;
  if (hash === '#/account' || hash === '#/member-setup') return <Account />;
  if (s.error && (!s.memberships || !s.data)) return <main className="app no-nav"><section className="card stack" role="alert"><h1>{t("খাতা লোড করা যায়নি")}</h1><p>{s.error}</p><button className="btn" disabled={s.loading} onClick={() => s.refresh().catch(() => {})}>{t("আবার চেষ্টা করুন")}</button><a href="#/account">{t("আমার অ্যাকাউন্ট")}</a></section></main>;
  if (!s.memberships) return <div className="app no-nav center"><Spinner /></div>;
  if (invite) return <Invite key={invite} code={invite} />;
  if (!s.memberships.length && hash === '#/open') return <main className="kh-welcome kh-new">
    <header><img src="/icon.svg" alt="" width="32" height="32" />MessMate</header>
    <section className="kh-new-body card stack"><h1>{t("আমার খাতা")}</h1>
      <p>{t("এই অ্যাকাউন্টে এখনও কোনো খাতা নেই। নতুন খাতা তৈরি করুন অথবা সদস্য হিসেবে অ্যাডমিনের আমন্ত্রণ লিংক খুলুন।")}</p>
      <a className="btn" href="#/create">{t("নতুন খাতা তৈরি করুন")}</a>
      <a href="#/restore">{t("সদস্যের আমন্ত্রণ টোকেন দিন")}</a>
      <a href="#/account">{t("আমার অ্যাকাউন্ট")}</a>
    </section></main>;
  if (!s.memberships.length || hash === '#/new-group') return <Welcome signedIn />;
  if (!s.group || !s.data) return <Skeleton />;

  const r = hash === '#/open' || hash === '#/signin' ? '/' : hash.replace(/^#/, '') || '/';
  const canChat = s.me && !s.me.left_on && s.data.gid === s.gid;
  const inChat = r === '/chat' && canChat;
  if (r === '/add') return <PurchaseForm key={`add-${s.gid}-${s.me?.id}`} />;
  if (r.startsWith('/edit/')) return <PurchaseForm key={r} editId={r.split('/')[2]} />;

  const pendingForMe = (s.data.report.payments || []).filter((p) => p.status === 'pending' && p.to === s.me?.id).length;
  const tabs = [
    ['/', 'home', t("হোম")], ['/list', 'basket', t("বাজার")], ['/report', 'report', t("রিপোর্ট"), pendingForMe], ['/members', 'users', t("সদস্য")], ...(canChat ? [['/chat', 'chat', t('চ্যাট')]] : []), ['/settings', 'gear', t("সেটিংস")],
  ];
  let body;
  if (inChat) body = <GroupChat key={s.gid} />;
  else if (r === '/list') body = <PurchaseList />;
  else if (r === '/report') body = <Report />;
  else if (r === '/feed') body = <Feed />;
  else if (r === '/members') body = <Members view="members" />;
  else if (r === '/settings') body = <Members view="settings" />;
  else body = <Home />;
  return (
    <>
      <div className={inChat ? "app chat-tab-page" : "app"}>
        {!inChat && <a className={`bell${r === '/feed' ? ' on' : ''}`} href="#/feed" aria-label={s.unread ? `খবর, ${s.unread}টি নতুন` : t("খবর")}>
          <Icon name="bell" />{s.unread ? <span className="badge">{s.unread > 9 ? t("৯+") : toBnDigits(s.unread)}</span> : null}
        </a>}
        {body}
      </div>
      {!inChat && s.isActive && s.month === monthOf(todayDhaka()) && s.data.report.status !== 'finalized' && !s.data.closures.some(d=>d.ledger_date===todayDhaka()) &&
        <a href="#/add" className="mobile-quick-add noprint" aria-label={t('বাজার যোগ করুন')}><Icon name="plus" /></a>}
      <nav className="nav" aria-label={t("প্রধান মেনু")}><div className="nav-in">
        {tabs.map(([p, ic, label, badge]) => (
          <a key={p} aria-current={r === p ? "page" : undefined} href={`#${p}`} className={r === p || (p === '/' && r === '') ? 'on' : ''}>
            <Icon name={ic} />{label}{badge ? <span className="badge">{badge}</span> : null}
          </a>
        ))}
      </div></nav>
    </>
  );
}
