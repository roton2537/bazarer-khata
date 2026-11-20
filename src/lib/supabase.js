import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const configured = Boolean(url && key);
export const supabase = configured
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null;

const MAP = [
  [/Invalid login credentials/i, 'ইমেইল বা পাসওয়ার্ড ঠিক নয়।'],
  [/User already registered/i, 'এই ইমেইলে আগেই অ্যাকাউন্ট আছে। সাইন ইন করুন।'],
  [/Password should be at least/i, 'পাসওয়ার্ড অন্তত ৬ অক্ষরের হতে হবে।'],
  [/Email not confirmed/i, 'ইমেইল নিশ্চিত করা হয়নি। ইনবক্সের লিংকে ক্লিক করুন।'],
  [/Failed to fetch|NetworkError|Load failed/i, 'নেটওয়ার্কে সমস্যা। একটু পরে আবার চেষ্টা করুন।'],
  [/rate limit/i, 'অনেকবার চেষ্টা হয়েছে। একটু পরে আবার চেষ্টা করুন।'],
  [/JWT|not authenticated/i, 'সেশন শেষ হয়েছে। আবার সাইন ইন করুন।'],
];
export function errText(e) {
  const m = (e && (e.message || e.error_description)) || String(e || '');
  for (const [re, t] of MAP) if (re.test(m)) return t;
  return m || 'কিছু একটা ভুল হয়েছে।';
}

export async function rpc(name, args = {}) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(errText(error));
  return data;
}
export async function q(builder) {
  const { data, error } = await builder;
  if (error) throw new Error(errText(error));
  return data;
}
