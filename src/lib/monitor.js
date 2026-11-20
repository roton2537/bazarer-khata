// ত্রুটি-পর্যবেক্ষণ: VITE_SENTRY_DSN দিলে Sentry-তে পাঠায়; না দিলে কিছুই পাঠায় না।
let sentry = null;
export async function initMonitor() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;
  try {
    const S = await import('@sentry/browser');
    S.init({ dsn, tracesSampleRate: 0, sendDefaultPii: false, environment: import.meta.env.MODE });
    sentry = S;
  } catch { /* পর্যবেক্ষণ বন্ধ থাকলেও অ্যাপ চলবে */ }
}
export function reportError(e, info) { try { sentry?.captureException(e, { extra: info }); } catch { /* */ } }
