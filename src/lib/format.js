import {language,t} from './language.js';
// টাকা মুদ্রার ক্ষুদ্রতম এককে (পয়সা) রাখা হয়; এখানে শুধু ইনপুট পার্স ও প্রদর্শন।
const BN = '০১২৩৪৫৬৭৮৯';
export const toEnDigits = (s) => String(s ?? '').replace(/[০-৯]/g, (d) => String(BN.indexOf(d)));
export const toBnDigits = (s) => language() === 'en' ? toEnDigits(s) : String(s).replace(/[0-9]/g, (d) => BN[Number(d)]);

export const MONTHS = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];

export const CURRENCIES = [
  { code: 'BDT', symbol: '৳', name: 'টাকা', gen: 'টাকার', decimals: 2 },
  { code: 'INR', symbol: '₹', name: 'রুপি', gen: 'রুপির', decimals: 2 },
  { code: 'SAR', symbol: 'SAR', name: 'রিয়াল', gen: 'রিয়ালের', decimals: 2 },
  { code: 'AED', symbol: 'AED', name: 'দিরহাম', gen: 'দিরহামের', decimals: 2 },
  { code: 'MYR', symbol: 'RM', name: 'রিঙ্গিত', gen: 'রিঙ্গিতের', decimals: 2 },
  { code: 'USD', symbol: '$', name: 'ডলার', gen: 'ডলারের', decimals: 2 },
  { code: 'GBP', symbol: '£', name: 'পাউন্ড', gen: 'পাউন্ডের', decimals: 2 },
  { code: 'EUR', symbol: '€', name: 'ইউরো', gen: 'ইউরোর', decimals: 2 },
];

// "৫০০", "500", "১২.৫", "১,২৫০" → ক্ষুদ্রতম এককে পূর্ণসংখ্যা। ভুল হলে null। কোনো float নয়।
export function parseMoney(input, decimals = 2) {
  const s = toEnDigits(input).replace(/[,\s৳]/g, '');
  if (!/^\d+(\.\d*)?$/.test(s)) return null;
  const [w, f = ''] = s.split('.');
  if (f.length > decimals && /[1-9]/.test(f.slice(decimals))) return null;
  const frac = (f + '0'.repeat(decimals)).slice(0, decimals);
  const v = Number(w) * 10 ** decimals + Number(frac || 0);
  return Number.isSafeInteger(v) ? v : null;
}

// ভারতীয় পদ্ধতিতে কমা: ২,০০,০০০
function groupInt(n) {
  const s = String(Math.abs(n));
  let res;
  if (s.length <= 3) res = s;
  else {
    let head = s.slice(0, -3), tail = s.slice(-3);
    while (head.length > 2) { tail = head.slice(-2) + ',' + tail; head = head.slice(0, -2); }
    res = head ? head + ',' + tail : tail;
  }
  return (n < 0 ? '-' : '') + res;
}

export function fmtNum(minor, decimals = 2) {
  const p = 10 ** decimals;
  const neg = minor < 0; const a = Math.abs(minor);
  const whole = Math.floor(a / p); const frac = a % p;
  let t = groupInt(whole);
  if (frac) t += '.' + String(frac).padStart(decimals, '0');
  return toBnDigits((neg ? '-' : '') + t);
}
export const fmtMoney = (minor, g) => `${fmtNum(minor, g?.currency_decimals ?? 2)} ${language()==='en' ? g?.currency_code || 'BDT' : g?.currency_name ?? 'টাকা'}`;
export const fmtShort = (minor, g) => `${g?.currency_symbol ?? '৳'}${fmtNum(minor, g?.currency_decimals ?? 2)}`;
// ইনপুট বক্সে দেখানোর জন্য (কমা ছাড়া, ইংরেজি অঙ্ক)
export function minorToInput(minor, decimals = 2) {
  if (!minor) return '';
  const p = 10 ** decimals; const w = Math.floor(minor / p); const f = minor % p;
  return f ? `${w}.${String(f).padStart(decimals, '0').replace(/0+$/, '')}` : String(w);
}

export const pad = (n) => String(n).padStart(2, '0');
export function todayDhaka() {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return p; // YYYY-MM-DD
}
export const monthOf = (d) => d.slice(0, 7) + '-01';
export function addMonths(m, n) {
  const [y, mo] = m.split('-').map(Number);
  const t = y * 12 + (mo - 1) + n;
  return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}-01`;
}
const months = () => language() === 'en' ? ['January','February','March','April','May','June','July','August','September','October','November','December'] : MONTHS;
export const monthLabel = (m) => `${months()[Number(m.slice(5, 7)) - 1]} ${toBnDigits(m.slice(0, 4))}`;
export const dayLabel = (d) => `${toBnDigits(Number(d.slice(8, 10)))} ${months()[Number(d.slice(5, 7)) - 1]}`;
export const dateLabel = (d) => `${dayLabel(d)} ${toBnDigits(d.slice(0, 4))}`;
export function timeAgo(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'এইমাত্র';
  if (s < 3600) return `${toBnDigits(Math.floor(s / 60))} মিনিট আগে`;
  if (s < 86400) return `${toBnDigits(Math.floor(s / 3600))} ঘণ্টা আগে`;
  if (s < 86400 * 7) return `${toBnDigits(Math.floor(s / 86400))} দিন আগে`;
  return dateLabel(new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' }));
}
// সংশোধনের অনুরোধের সুযোগ: পরের মাসের প্রথম দুই দিন
export function correctionWindowOpen(month, today) {
  const next = addMonths(month, 1);
  const d = new Date(next + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1);
  return today >= next && today <= d.toISOString().slice(0, 10);
}
export const balanceText = (b) => t(b > 0 ? 'পাবেন' : b < 0 ? 'দেবেন' : 'মিটেছে');
export const newToken = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 3) | 8).toString(16); }));
