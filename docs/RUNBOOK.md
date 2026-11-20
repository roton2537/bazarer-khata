# চালুর ও রক্ষণাবেক্ষণের রানবুক

## ১. পরিবেশ-চলক (Vercel → Settings → Environment Variables)
| নাম | কাজ | বাধ্যতামূলক |
|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Supabase সংযোগ | হ্যাঁ |
| `VITE_VAPID_PUBLIC_KEY` | পুশ নোটিফিকেশন | পুশ চাইলে |
| `VITE_SENTRY_DSN` | ত্রুটি-পর্যবেক্ষণ (Sentry-তে প্রকল্প খুলে DSN দিন) | সুপারিশ |
| `VITE_TURNSTILE_SITE_KEY` | Cloudflare Turnstile captcha | সুপারিশ (নিচে ৪) |

## ২. মাইগ্রেশন চালানো (সবসময় এই ক্রমে)
1. Supabase → Database → Backups থেকে ব্যাকআপ নিন (বা PITR চালু থাকলে সময় টুকে রাখুন)।
2. `supabase/tools/verify_schema.sql` চালিয়ে দেখুন প্রোডাকশন এখন কোন অবস্থায়। (০০০৭ চালানোর আগে "নেই" সারি আসবে, সেগুলো ০০০৫–০০০৭-এর।)
3. নতুন মাইগ্রেশনগুলো ক্রমে চালান: `0005` → `0006` → `0007`।
4. আবার `verify_schema.sql` চালান। ফল **ফাঁকা** হতে হবে।
5. তারপর কোড পুশ করুন (Vercel ডিপ্লয় করবে)।
CLI চাইলে: `supabase link --project-ref <ref>` তারপর `supabase db push`। (মাইগ্রেশন-ইতিহাস না মিললে আগে `supabase migration repair` লাগতে পারে। ব্যাকআপ নিয়ে করুন।)

## ৩. পুশ নোটিফিকেশন চালু করা (একবারের কাজ)
1. `supabase functions deploy notify` এবং secrets দিন: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `WEBHOOK_SECRET`।
2. Supabase → Database → Webhooks → নতুন: টেবিল `events`, ইভেন্ট `INSERT`, টাইপ Edge Function `notify`, হেডার `x-webhook-secret: <WEBHOOK_SECRET>`।
3. অ্যাপে সেটিংস → নোটিফিকেশন চালু করুন → **"পরীক্ষামূলক নোটিফিকেশন পাঠান"**। ফোনে ✓ এলে সেটআপ ঠিক।

## ৪. Captcha ও অজ্ঞাত সেশন সুরক্ষা
1. Cloudflare Turnstile-এ সাইট বানিয়ে site key ও secret নিন।
2. Supabase → Authentication → Settings → Bot and Abuse Protection: Captcha চালু, provider Turnstile, secret বসান।
3. Vercel-এ `VITE_TURNSTILE_SITE_KEY` দিন, পুনরায় ডিপ্লয় করুন।
4. Authentication → Rate Limits-এ anonymous sign-ins প্রতি ঘণ্টা/IP কমিয়ে রাখুন।
⚠ Supabase-এ captcha চালু করলে অ্যাপে কী না থাকলে সাইন-ইন আটকে যাবে। দুটোই একসঙ্গে চালু করুন।

## ৫. ব্যাকআপ ও পুনরুদ্ধার
- Supabase Pro-তে দৈনিক ব্যাকআপ ও PITR আছে। ফ্রি প্ল্যানে নেই: তখন সপ্তাহে একবার `pg_dump` নিয়ে নিরাপদ জায়গায় রাখুন।
- বছরে অন্তত একবার ব্যাকআপ থেকে আলাদা প্রজেক্টে পুনরুদ্ধার করে দেখুন।

## ৬. স্টেজিং
আলাদা একটি Supabase প্রজেক্ট ও Vercel প্রিভিউ-ডিপ্লয় বানান। নতুন মাইগ্রেশন আগে সেখানে চালিয়ে `verify_schema.sql` ও আসল ফোনে পরীক্ষা করুন, তারপর প্রোডাকশনে। ডেমো-মক (`npm run build:demo`) শুধু পর্দা দেখার জন্য, আসল আচরণের প্রমাণ নয়।

## ৭. স্বয়ংক্রিয় পরীক্ষা
- `npm test`: SQL (হিসাব, অনুমতি, মেয়াদ), অ্যাপ-থেকে-ডেটাবেস চুক্তি, ফরম্যাট।
- `npm run e2e`: ডেমো বিল্ডে ৩ ভূমিকার ১১টি পর্দা Chrome-এ খুলে যাচাই (আগে `npm run build:demo`)।
- GitHub Actions (`.github/workflows/ci.yml`) প্রতি পুশে এগুলো চালায়।

## ৮. এখনও হাতে করতে হয়
- গত মাস চূড়ান্ত করার স্বয়ংক্রিয় ইমেইল/পুশ নেই (অ্যাপের ভেতরে ব্যানার আছে)। দরকার হলে pg_cron/Edge Function দিয়ে বানানো যাবে।
- পেমেন্ট নিশ্চিত না হলে ২ দিন পর স্বয়ংক্রিয় রিমাইন্ডার নেই; "মনে করিয়ে দিন" বাটন আছে।
