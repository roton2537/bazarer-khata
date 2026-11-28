import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '../store.jsx';
import { supabase } from '../lib/supabase.js';
import { useLanguage } from '../lib/language.js';
import './chat.css';

const pageSize = 40;
const strings = {
  en: ['Group chat','Back','Write a message','Send','Load earlier messages','Start the conversation','Messages could not be loaded.','Retry','Message could not be sent. Try again.','Mute chat alerts','Unmute chat alerts','Loading…','Could not update chat alerts.'],
  bn: ['গ্রুপ চ্যাট','ফিরে যান','মেসেজ লিখুন','পাঠান','আগের মেসেজ দেখুন','প্রথম মেসেজটি পাঠান','মেসেজ লোড হয়নি।','আবার চেষ্টা করুন','মেসেজ পাঠানো যায়নি। আবার চেষ্টা করুন।','চ্যাটের নোটিফিকেশন বন্ধ করুন','চ্যাটের নোটিফিকেশন চালু করুন','লোড হচ্ছে…','চ্যাটের নোটিফিকেশন বদলানো যায়নি।'],
};

function mergeRows(previous, incoming) {
  const rows = new Map(previous.map(row => [row.id, row]));
  incoming.forEach(row => rows.set(row.id, row));
  return [...rows.values()].sort((a, b) => a.seq - b.seq);
}

export default function GroupChat() {
  const { gid, group, me, uid } = useStore();
  const { language } = useLanguage();
  const labels = strings[language] || strings.bn;
  const [rows, setRows] = useState([]);
  const [ready, setReady] = useState(false);
  const [more, setMore] = useState(false);
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [muted, setMuted] = useState(null);
  const [olderBusy, setOlderBusy] = useState(false);
  const latest = useRef(0), pending = useRef(null), list = useRef(null), atEnd = useRef(true);
  const refresh = useRef(null), sendLock = useRef(false);
  const query = useCallback(() => supabase.from('group_chat_messages').select('*').eq('group_id', gid), [gid]);

  useEffect(() => {
    let active = true, running = false, again = false;
    async function sync() {
      if (running) { again = true; return; }
      running = true;
      try {
        do {
          again = false;
          const cursor = latest.current;
          const request = cursor ? query().gt('seq', cursor).order('seq') : query().order('seq', {ascending:false});
          const { data, error: failure } = await request.limit(pageSize);
          if (!active) return;
          if (failure) { setError(6); return; }
          if (!cursor) setMore(data.length === pageSize);
          if (data.length) {
            latest.current = Math.max(...data.map(row => Number(row.seq)));
            setRows(prev => mergeRows(prev, data));
          }
          setReady(true);
          setError(old => old === 6 ? null : old);
          if (cursor && data.length === pageSize) again = true;
        } while (active && again);
      } finally { running = false; }
    }
    refresh.current = sync;
    const channel = supabase.channel('chat-' + gid).on('postgres_changes',
      { event:'INSERT', schema:'public', table:'group_chat_messages', filter:'group_id=eq.' + gid }, sync)
      .subscribe(status => { if (status === 'SUBSCRIBED') sync(); });
    sync();
    const wake = () => { if (!document.hidden) sync(); };
    const timer = setInterval(wake, 15000);
    document.addEventListener('visibilitychange', wake);
    supabase.from('group_chat_mutes').select('user_id').eq('group_id',gid).eq('user_id',uid).maybeSingle()
      .then(({data,error}) => { if (active && !error) setMuted(Boolean(data)); });
    return () => { active = false; clearInterval(timer); document.removeEventListener('visibilitychange',wake); supabase.removeChannel(channel); };
  }, [gid, uid, query]);

  useEffect(() => {
    if (atEnd.current && list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [rows]);

  async function loadOlder() {
    setOlderBusy(true);
    try {
      const { data, error } = await query().lt('seq',rows[0].seq).order('seq',{ascending:false}).limit(pageSize);
      if (error) { setError(6); return; }
      atEnd.current = false;
      setRows(prev => mergeRows(prev,data));
      setMore(data.length === pageSize);
    } finally { setOlderBusy(false); }
  }

  async function send(e) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || sendLock.current) return;
    if (pending.current?.body !== body) pending.current = { body, id: crypto.randomUUID() };
    sendLock.current = true;
    setSending(true);
    try {
      const { data, error } = await supabase.rpc('send_group_chat',{p_group:gid,p_id:pending.current.id,p_body:body}).single();
      if (error || !data) { setError(8); return; }
      pending.current = null;
      setDraft(''); setError(null); atEnd.current = true;
      setRows(prev => mergeRows(prev,[data]));
      refresh.current();
    } finally { sendLock.current = false; setSending(false); }
  }

  async function toggleMute() {
    const before = muted;
    setMuted(null);
    const table = supabase.from('group_chat_mutes');
    const { error } = before ? await table.delete().eq('group_id',gid).eq('user_id',uid) : await table.insert({group_id:gid,user_id:uid});
    if (error) setError(12);
    setMuted(error ? before : !before);
  }

  return <main className="group-chat">
    <header><a href="#/" aria-label={labels[1]}>‹</a><div><h1>{labels[0]}</h1><small>{group.name}</small></div>
      {muted !== null && <button type="button" onClick={toggleMute} aria-pressed={muted}>{labels[muted ? 10 : 9]}</button>}</header>
    <section ref={list} aria-label={labels[0]} onScroll={e => { const el=e.currentTarget; atEnd.current=el.scrollHeight-el.scrollTop-el.clientHeight<64; }}>
      {more && <button className="chat-older" onClick={loadOlder} disabled={olderBusy}>{labels[4]}</button>}
      {!rows.length && <p className="chat-empty">{labels[ready ? 5 : 11]}</p>}
      {rows.map(msg => <article className={msg.sender_id === me?.id ? 'mine' : ''} key={msg.id}>
        <strong>{msg.sender_name}</strong><p>{msg.body}</p>
        <time dateTime={msg.created_at}>{new Date(msg.created_at).toLocaleString(language === 'en' ? 'en-GB' : 'bn-BD',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</time>
      </article>)}
    </section>
    {error !== null && <div role="alert">{labels[error]} {error === 6 && <button onClick={() => refresh.current()}>{labels[7]}</button>}</div>}
    <form onSubmit={send}><textarea aria-label={labels[2]} placeholder={labels[2]} rows="2" maxLength={2000} value={draft} readOnly={sending} onChange={e=>setDraft(e.target.value)} />
      <button type="submit" disabled={sending || !draft.trim()}>{labels[3]}</button></form>
  </main>;
}
