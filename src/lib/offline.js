// Offline journal: never replay an entry under another account or silently drop a write.
import { rpc, supabase } from './supabase.js';
import { queueKey, sameOwner, queueable, legacyQueueKey } from './offline-core.js';

const read = (key) => {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value : [];
  } catch { return []; }
};
const save = (key, values) => {
  const serialized = JSON.stringify(values);
  try {
    localStorage.setItem(key, serialized);
    if (localStorage.getItem(key) !== serialized) throw new Error('Storage verification failed');
  } catch {
    throw new Error('ফোনের স্টোরেজে অফলাইন হিসাব রাখা যায়নি। আবার চেষ্টা করুন বা ইন্টারনেট চালু করুন।');
  }
};
const announce = () => window.dispatchEvent(new Event('bk-queue'));
const currentUser = async () => {
  const {data, error} = await supabase.auth.getSession();
  if (error) throw error;
  return data.session?.user?.id || null;
};
export const isNetworkError = (e) => !navigator.onLine || /নেটওয়ার্কে সমস্যা|Failed to fetch|NetworkError|Load failed/i.test(e?.message || '');

export const queueState = (userId) => userId ? ({
  pending: read(queueKey(userId)), failed: read(queueKey(userId, 'failed')), legacy: read(legacyQueueKey),
}) : ({pending: [], failed: [], legacy: read(legacyQueueKey)});
export const dismissFailed = (userId) => {
  if (!userId) return;
  save(queueKey(userId, 'failed'), []);
  announce();
};

export async function rpcQueued(name, args) {
  const userId = await currentUser();
  if (!userId) throw new Error('হিসাব জমা দিতে প্রথমে খাতায় প্রবেশ করুন।');
  try { return await rpc(name, args); }
  catch (error) {
    if (!queueable(name) || !isNetworkError(error)) throw error;
    // A sign-out or account switch may happen during the request.
    if (await currentUser() !== userId) throw new Error('অ্যাকাউন্ট বদলেছে। লেখাটি আবার যাচাই করে জমা দিন।');
    if (!args?.p_group || !args?.p_token) throw new Error('অফলাইন হিসাবের পরিচয় অসম্পূর্ণ; জমা দেওয়া যায়নি।');
    const key = queueKey(userId);
    const pending = read(key);
    if (!pending.some(item => item.args?.p_token === args.p_token && item.args?.p_group === args.p_group)) {
      save(key, [...pending, {name, args, userId, at: Date.now()}]);
    }
    announce();
    return {queued: true};
  }
}

let flushing = false;
export async function flushQueue(userId) {
  if (flushing || !userId) return 0;
  flushing = true;
  let sent = 0;
  try {
    const pendingKey = queueKey(userId);
    const failedKey = queueKey(userId, 'failed');
    for (;;) {
      if (await currentUser() !== userId) break;
      const entries = read(pendingKey);
      if (!entries.length) break;
      const entry = entries[0];
      if (!sameOwner(entry, userId) || !queueable(entry.name) || !entry.args.p_token) {
        save(failedKey, [...read(failedKey), {reason: 'পুরোনো বা অন্য অ্যাকাউন্টের লেখা স্বয়ংক্রিয়ভাবে পাঠানো হয়নি।', desc: entry.args?.p_desc || '', at: entry.at}]);
      } else {
        try {
          await rpc(entry.name, entry.args);
          sent++;
        } catch (error) {
          if (isNetworkError(error)) break;
          // Keep the entire failed operation for manual recovery.
          save(failedKey, [...read(failedKey), {...entry, reason: error.message, desc: entry.args.p_desc || ''}]);
        }
      }
      // Re-read before removing: a second tab may have appended new work meanwhile.
      save(pendingKey, read(pendingKey).filter(item => !(item.args?.p_token === entry.args?.p_token && item.args?.p_group === entry.args?.p_group)));
      announce();
    }
  } finally { flushing = false; announce(); }
  return sent;
}
