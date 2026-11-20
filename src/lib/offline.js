// অফলাইন-সারি: নেটওয়ার্ক না থাকলে বাজার ও পরিশোধ লিখে রেখে নেট এলে পাঠানো হয়।
// প্রতিটি অনুরোধে client_token আছে, তাই দুবার পাঠালেও একবারই যোগ হয় (সার্ভারে নিশ্চিত করা)।
import { rpc } from './supabase.js';

const KEY = 'bk_queue_v1', FAIL = 'bk_queue_failed_v1';
const SAFE = new Set(['add_purchase', 'add_payment']);
const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch { return []; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ভরা স্টোরেজ */ } };
const emit = () => window.dispatchEvent(new Event('bk-queue'));
export const isNetworkError = (e) => !navigator.onLine || /নেটওয়ার্কে সমস্যা|Failed to fetch|NetworkError|Load failed/i.test(e?.message || '');

export const queueState = () => ({ pending: read(KEY), failed: read(FAIL) });
export const dismissFailed = () => { write(FAIL, []); emit(); };

export async function rpcQueued(name, args) {
  try { return await rpc(name, args); }
  catch (e) {
    if (SAFE.has(name) && isNetworkError(e)) { write(KEY, [...read(KEY), { name, args, at: Date.now() }]); emit(); return { queued: true }; }
    throw e;
  }
}

let flushing = false;
export async function flushQueue() {
  if (flushing) return 0;
  flushing = true; let sent = 0;
  try {
    for (;;) {
      const q = read(KEY); if (!q.length) break;
      const it = q[0];
      try { await rpc(it.name, it.args); sent++; }
      catch (e) {
        if (isNetworkError(e)) break;                                   // নেট নেই: পরে আবার
        write(FAIL, [...read(FAIL), { name: it.name, reason: e.message, at: it.at, desc: it.args.p_desc || '' }]);   // সার্ভার ফিরিয়েছে
      }
      write(KEY, read(KEY).slice(1)); emit();
    }
  } finally { flushing = false; emit(); }
  return sent;
}
