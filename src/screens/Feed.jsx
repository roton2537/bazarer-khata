import React, { useEffect, useState } from 'react';
import { useStore } from '../store.jsx';
import { timeAgo } from '../lib/format.js';
import { Empty } from './parts.jsx';

export default function Feed() {
  const s = useStore();
  const [f, setF] = useState('all');
  useEffect(() => { s.markFeedSeen(); }, []);
  const isPay = (e) => /^payment|^adjustment/.test(e.kind || '');
  const ev = s.data.events.filter((e) => (f === 'all' ? true : f === 'pay' ? isPay(e) : e.actor_id === s.me?.id));
  return (
    <>
      <div className="topbar"><div className="eyebrow">গ্রুপের সর্বশেষ খবর</div><h1 className="break">{s.group.name}</h1></div>
      <div className="seg three" role="tablist" aria-label="খবরের ধরন">
        {[['all', 'সব'], ['pay', 'পরিশোধ'], ['mine', 'আমার']].map(([k, l]) => <button key={k} role="tab" aria-selected={f === k} className={f === k ? 'on' : ''} onClick={() => setF(k)}>{l}</button>)}
      </div>
      <div className="card">
        {ev.length === 0 ? <Empty icon="bell" title="এখনও কোনো খবর নেই" /> : ev.map((e) => (
          <div className="item" key={e.id}><div className="break">{e.message}</div><div className="small muted">{timeAgo(e.created_at)}</div></div>
        ))}
      </div>
    </>
  );
}
