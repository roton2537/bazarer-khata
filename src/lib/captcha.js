// Cloudflare Turnstile: VITE_TURNSTILE_SITE_KEY দিলে এবং Supabase-এ captcha চালু থাকলে
// সাইন-ইন/সাইন-আপ/অজ্ঞাত সেশনের আগে টোকেন নেওয়া হয়। কী না দিলে কিছুই করে না।
const KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY;
let loading;
const load = () => loading || (loading = new Promise((res, rej) => {
  if (window.turnstile) return res(window.turnstile);
  const s = document.createElement('script');
  s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  s.async = true; s.onload = () => res(window.turnstile); s.onerror = () => rej(new Error('নিরাপত্তা-যাচাই লোড হয়নি। নেট দেখে আবার চেষ্টা করুন।'));
  document.head.appendChild(s);
}));
export const captchaEnabled = Boolean(KEY);
export async function captchaToken() {
  if (!KEY) return undefined;
  const t = await load();
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:50%;bottom:90px;transform:translateX(-50%);z-index:60';
  document.body.appendChild(box);
  return new Promise((resolve, reject) => {
    t.render(box, { sitekey: KEY, callback: (tok) => { box.remove(); resolve(tok); },
      'error-callback': () => { box.remove(); reject(new Error('নিরাপত্তা-যাচাই ব্যর্থ। আবার চেষ্টা করুন।')); } });
  });
}
