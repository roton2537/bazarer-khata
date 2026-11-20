import { rpc } from './supabase.js';

const b64 = (s) => { const p = '='.repeat((4 - (s.length % 4)) % 4); const r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...r].map((c) => c.charCodeAt(0))); };
export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export async function enablePush() {
  if (!pushSupported()) throw new Error('এই ব্রাউজারে পুশ নোটিফিকেশন চলে না (আইফোনে আগে অ্যাপটি হোম স্ক্রিনে যোগ করুন)। অ্যাপের ভেতরে খবর দেখা যাবে।');
  const key = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!key) throw new Error('পুশ নোটিফিকেশন এখনও সার্ভারে চালু করা হয়নি। অ্যাপের ভেতরে খবর দেখা যাবে।');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('ফোনে এই অ্যাপের নোটিফিকেশনের অনুমতি বন্ধ। ফোনের সেটিংসে অনুমতি দিলে চালু হবে। অ্যাপের ভেতরে খবর দেখা যাবে।');
  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(key) }));
  const j = sub.toJSON();
  await rpc('save_push_subscription', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth });
}

export async function disablePush() {
  try {
    if (pushSupported()) {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js');
      const sub = reg && (await reg.pushManager.getSubscription());
      if (sub) { await rpc('remove_push_subscription', { p_endpoint: sub.endpoint }); await sub.unsubscribe(); }
    }
  } finally { await rpc('set_push', { p_enabled: false }); }
}
