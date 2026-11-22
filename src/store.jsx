import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase, rpc, q } from './lib/supabase.js';
import { todayDhaka, monthOf } from './lib/format.js';
import { useToast } from './ui.jsx';

const Ctx = createContext(null);
export const useStore = () => useContext(Ctx);

export function StoreProvider({ session, children }) {
  const uid = session.user.id;
  const toast = useToast();
  const [memberships, setMemberships] = useState(null);       // আমার সব সদস্যপদ (গ্রুপসহ)
  const [gid, setGidState] = useState(() => localStorage.getItem('bk_gid') || null);
  const [month, setMonth] = useState(monthOf(todayDhaka()));
  const [loaded, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState(null);
  const data = loaded?.gid === gid && loaded?.month === month ? loaded : null;
  const [error, setError] = useState('');
  const seq = useRef(0);

  const loadMemberships = useCallback(async () => {
    const [rows, p] = await Promise.all([
      q(supabase.from('members').select('*, groups(id,name,currency_code,currency_symbol,currency_name,currency_gen,currency_decimals,created_at)').eq('user_id', uid).order('created_at')),
      q(supabase.from('profiles').select('*').eq('id', uid).maybeSingle()),
    ]);
    // প্রতি গ্রুপে সর্বশেষ সদস্যপদ
    const byG = new Map();
    for (const r of rows) {
      const cur = byG.get(r.group_id);
      if (!cur || (cur.left_on && !r.left_on) || (!!cur.left_on === !!r.left_on && r.seq > cur.seq)) byG.set(r.group_id, r);
    }
    const list = [...byG.values()].filter((r) => r.groups);
    setMemberships(list);

    setProfile(p);
    return list;
  }, [uid]);

  const setGid = useCallback((id) => { setGidState(id); if (id) localStorage.setItem('bk_gid', id); }, []);

  const loadGroup = useCallback(async (g, m) => {
    const my = ++seq.current;
    setLoading(true); setError('');
    try {
      const [members, pauses, purchases, report, months, corrections, events, payRows] = await Promise.all([
        q(supabase.from('members').select('*').eq('group_id', g).order('seq')),
        q(supabase.from('pauses').select('*').eq('group_id', g)),
        q(supabase.from('purchases').select('*, purchase_items(*), purchase_shares(*)').eq('group_id', g).eq('month', m)
          .is('deleted_at', null).order('bazar_date', { ascending: false }).order('created_at', { ascending: false })),
        rpc('month_report', { p_group: g, p_month: m }),
        rpc('group_months', { p_group: g }),
        rpc('list_corrections', { p_group: g, p_month: m }),
        q(supabase.from('events').select('*').eq('group_id', g).order('created_at', { ascending: false }).limit(80)),
        q(supabase.from('payments').select('id,kind,note,reminded_at').eq('group_id', g).eq('month', m)),
      ]);
      const paymentMeta = Object.fromEntries((payRows || []).map((r) => [r.id, r]));
      if (my !== seq.current) return;
      setData({ members, pauses, purchases, report, months, corrections, events, paymentMeta, gid: g, month: m });
    } catch (e) { if (my === seq.current) { setError(e.message); toast(e.message, true); } }
    finally { if (my === seq.current) setLoading(false); }
  }, [toast]);

  const refresh = useCallback(async () => {
    try {
      setError('');
      const list = await loadMemberships();
      return list;
    } catch (e) {
      setError(e.message); toast(e.message, true); throw e;
    }
  }, [loadMemberships, toast]);

  useEffect(() => { refresh().catch(() => {}); }, [refresh]);
  useEffect(() => {
    if (!memberships?.length) return;
    if (!memberships.some(row => row.group_id === gid)) { setGid(memberships[0].group_id); return; }
    loadGroup(gid, month);
  }, [gid, month, memberships, setGid, loadGroup]);

  // অন্যের নতুন খবর এলে স্বয়ংক্রিয় হালনাগাদ (Realtime চালু থাকলে)
  useEffect(() => {
    if (!gid) return undefined;
    let ch;
    let timer;
    const schedule = () => {
      if (document.visibilityState !== 'visible') return;
      clearTimeout(timer);
      timer = setTimeout(() => loadGroup(gid, month), 350);
    };
    try {
      ch = supabase.channel(`ev-${gid}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'events', filter: `group_id=eq.${gid}` }, schedule).subscribe();
    } catch { /* Realtime is optional; foreground refresh still works. */ }
    const onVis = () => { if (document.visibilityState === 'visible') schedule(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', onVis); if (ch) supabase.removeChannel(ch); };
  }, [gid, month, loadGroup]);

  const cur = memberships?.find((x) => x.group_id === gid) || null;
  const group = cur?.groups || null;
  const me = useMemo(() => (data && cur ? data.members.find((m) => m.id === cur.id) || null : null), [data, cur]);
  const isAdmin = !!me && me.role === 'admin' && !me.left_on;
  const isActive = !!me && !me.left_on;
  const myRow = data?.report?.members?.find((m) => m.id === me?.id) || null;

  // খবর: কোনটি আমি দেখিনি (এই ডিভাইসে শেষ দেখার সময় ধরে)
  const [seenTick, setSeenTick] = useState(0);
  const seenKey = `bk_seen_${gid}`;
  const unread = useMemo(() => {
    if (!data || !me) return 0;
    let seen = ''; try { seen = localStorage.getItem(seenKey) || ''; } catch { /* */ }
    if (!seen) return 0;   // প্রথমবার: সবকিছুকে "না-পড়া" দেখানো হয় না
    return data.events.filter((e) => e.created_at > seen && e.actor_id !== me.id).length;
  }, [data, me, seenKey, seenTick]);
  const markFeedSeen = useCallback(() => {
    try { localStorage.setItem(seenKey, new Date().toISOString()); } catch { /* */ }
    setSeenTick((n) => n + 1);
  }, [seenKey]);

  useEffect(() => { // প্রথমবার খুললে বর্তমান খবরগুলো "দেখা" ধরা হয়
    try { if (data && me && !localStorage.getItem(seenKey)) markFeedSeen(); } catch { /* */ }
  }, [data, me, seenKey, markFeedSeen]);

  const value = { unread, markFeedSeen, session, uid, profile, memberships, gid, setGid, group, month, setMonth, data, loading, error, refresh, me, isAdmin, isActive, myRow, reloadGroup: () => loadGroup(gid, month) };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
