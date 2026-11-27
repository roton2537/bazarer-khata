import { t } from '../lib/language.js';
import React, { useEffect, useState } from 'react';
import { useStore } from '../store.jsx';
import { timeAgo } from '../lib/format.js';
import { Empty, Header } from './parts.jsx';

export default function Feed() {
  const s = useStore();
  const [f, setF] = useState('all');
  useEffect(() => { s.markFeedSeen(); }, [s.markFeedSeen, s.data.events[0]?.id]);
  const isPay = (e) => /^payment|^adjustment/.test(e.kind || '');
  const ev = s.data.events.filter((e) => (f === 'all' ? true : f === 'pay' ? isPay(e) : e.actor_id === s.me?.id));
  return (
    <>
      <Header title={t("খবর")} />
      <div className="seg three" role="group" aria-label={t("খবরের ধরন")}>
        {[['all', t("সব")], ['pay', t("পরিশোধ")], ['mine', t("আমার")]].map(([k, l]) => <button key={k} aria-pressed={f === k} className={f === k ? 'on' : ''} onClick={() => setF(k)}>{l}</button>)}
      </div>
      <div className="card">
        {ev.length === 0 ? <Empty icon="bell" title={t("এখনও কোনো খবর নেই")} /> : ev.map((e) => (
          <div className="item" key={e.id}><div className="break">{e.message}</div><div className="small muted">{timeAgo(e.created_at)}</div></div>
        ))}
      </div>
    </>
  );
}
