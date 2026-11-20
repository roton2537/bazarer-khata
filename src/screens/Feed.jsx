import React from 'react';
import { useStore } from '../store.jsx';
import { timeAgo } from '../lib/format.js';
import { Empty } from './parts.jsx';

export default function Feed() {
  const s = useStore();
  const ev = s.data.events;
  return (
    <>
      <div className="topbar"><div className="eyebrow">গ্রুপের সর্বশেষ খবর</div><h1 className="break">{s.group.name}</h1></div>
      <div className="card">
        {ev.length === 0 ? <Empty icon="bell" title="এখনও কোনো খবর নেই" /> : ev.map((e) => (
          <div className="item" key={e.id}><div className="break">{e.message}</div><div className="small muted">{timeAgo(e.created_at)}</div></div>
        ))}
      </div>
    </>
  );
}
