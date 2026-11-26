import React from 'react';
import { useStore } from '../store.jsx';
import { todayDhaka, monthOf, addMonths, monthLabel } from '../lib/format.js';

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
