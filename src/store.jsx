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
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState(null);
  const seq = useRef(0);

  const loadMemberships = useCallback(async () => {
    const rows = await q(supabase.from('members').select('*, groups(*)').eq('user_id', uid).order('created_at'));
    // প্রতি গ্রুপে সর্বশেষ সদস্যপদ
    const byG = new Map();
    for (const r of rows) {
      const cur = byG.get(r.group_id);
      if (!cur || (cur.left_on && !r.left_on) || (!!cur.left_on === !!r.left_on && r.seq > cur.seq)) byG.set(r.group_id, r);
    }
    const list = [...byG.values()].filter((r) => r.groups);
    setMemberships(list);
    const p = await q(supabase.from('profiles').select('*').eq('id', uid).maybeSingle());
    setProfile(p);
    return list;
  }, [uid]);

  const setGid = useCallback((id) => { setGidState(id); if (id) localStorage.setItem('bk_gid', id); }, []);

  const loadGroup = useCallback(async (g, m) => {
    const my = ++seq.current;
    setLoading(true);
    try {
      const [members, pauses, purchases, report, months, corrections, events] = await Promise.all([
        q(supabase.from('members').select('*').eq('group_id', g).order('seq')),
        q(supabase.from('pauses').select('*').eq('group_id', g)),
        q(supabase.from('purchases').select('*, purchase_items(*), purchase_shares(*)').eq('group_id', g).eq('month', m)
          .is('deleted_at', null).order('bazar_date', { ascending: false }).order('created_at', { ascending: false })),
        rpc('month_report', { p_group: g, p_month: m }),
        rpc('group_months', { p_group: g }),
        rpc('list_corrections', { p_group: g, p_month: m }),
        q(supabase.from('events').select('*').eq('group_id', g).order('created_at', { ascending: false }).limit(80)),
      ]);
      if (my !== seq.current) return;
      setData({ members, pauses, purchases, report, months, corrections, events, gid: g, month: m });
    } catch (e) { if (my === seq.current) toast(e.message, true); }
    finally { if (my === seq.current) setLoading(false); }
  }, [toast]);

  useEffect(() => { loadMemberships().then((l) => {
    if (l.length && !l.find((x) => x.group_id === gid)) setGid(l[0].group_id);
  }).catch((e) => toast(e.message, true)); }, [loadMemberships]); // eslint-disable-line

  useEffect(() => { if (gid && memberships?.find((x) => x.group_id === gid)) loadGroup(gid, month); }, [gid, month, memberships, loadGroup]);

  const refresh = useCallback(async () => {
    const l = await loadMemberships();
    if (gid && l.find((x) => x.group_id === gid)) await loadGroup(gid, month);
    return l;
  }, [gid, month, loadMemberships, loadGroup]);

  // অন্যের নতুন খবর এলে স্বয়ংক্রিয় হালনাগাদ (Realtime চালু থাকলে)
  useEffect(() => {
    if (!gid) return undefined;
    let ch;
    try {
      ch = supabase.channel(`ev-${gid}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'events', filter: `group_id=eq.${gid}` },
        () => loadGroup(gid, month)).subscribe();
    } catch { /* ঐচ্ছিক */ }
    const onVis = () => { if (document.visibilityState === 'visible') loadGroup(gid, month); };
    document.addEventListener('visibilitychange', onVis);
    return () => { document.removeEventListener('visibilitychange', onVis); if (ch) supabase.removeChannel(ch); };
  }, [gid, month, loadGroup]);

  const cur = memberships?.find((x) => x.group_id === gid) || null;
  const group = cur?.groups || null;
  const me = useMemo(() => (data && cur ? data.members.find((m) => m.id === cur.id) || null : null), [data, cur]);
  const isAdmin = !!me && me.role === 'admin' && !me.left_on;
  const isActive = !!me && !me.left_on;
  const myRow = data?.report?.members?.find((m) => m.id === me?.id) || null;

  const value = { session, uid, profile, memberships, gid, setGid, group, month, setMonth, data, loading, refresh, me, isAdmin, isActive, myRow, reloadGroup: () => loadGroup(gid, month) };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
