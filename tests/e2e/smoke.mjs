// ব্রাউজার-স্মোক: ডেমো বিল্ডকে (নমুনা তথ্যে) প্রকৃত Chrome-এ খুলে প্রতিটি ভূমিকার মূল পর্দা যাচাই।
// আগে `npm run build:demo` চালাতে হবে। Chrome না থাকলে CHROME=/path/to/chrome দিন।
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = join(dirname(fileURLToPath(import.meta.url)), '../../dist-demo');
if (!existsSync(dist)) { console.error('dist-demo নেই। আগে: npm run build:demo'); process.exit(2); }
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/json' };
const server = createServer((req, res) => {
  let f = join(dist, decodeURIComponent(req.url.split('?')[0]));
  if (!existsSync(f) || statSync(f).isDirectory()) f = join(dist, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream' }); res.end(readFileSync(f));
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const chrome = process.env.CHROME || 'google-chrome';
// execFileSync নয়: সেটি এই প্রসেসের সার্ভারকেও আটকে দিত
const dom = async (as, hash) => (await run(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu', '--virtual-time-budget=15000', '--dump-dom',
  `http://localhost:${port}/?as=${as}${hash}`], { maxBuffer: 20e6, timeout: 90000 })).stdout;

const cases = [
  ['অ্যাডমিন হোম', 'admin', '#/', ['মনে করিয়ে দিন', 'সাম্প্রতিক বাজার']],
  ['অ্যাডমিন সদস্য', 'admin', '#/members', ['সরান', 'আমন্ত্রণ লিংক তৈরি করুন', 'মেয়াদ:']],
  ['অ্যাডমিন সেটিংস', 'admin', '#/settings', ['বিপজ্জনক কাজ', 'পুরো গ্রুপ মুছে ফেলুন', 'অ্যাডমিনের দায়িত্ব', 'Language / ভাষা']],
  ['অ্যাডমিন রিপোর্ট', 'admin', '#/report', ['সমন্বয় ভুক্তি', 'সারাংশ শেয়ার করুন', 'পরিশোধের তালিকা']],
  ['অ্যাডমিন বাজার', 'admin', '#/list', ['বাজার খুঁজুন', 'সব ক্রেতা']],
  ['অ্যাডমিন খবর', 'admin', '#/feed', ['পরিশোধ', 'আমার']],
  ['নতুন অ্যাডমিন', 'admin-new', '#/settings', ['লগআউট']],
  ['সদস্য হোম', 'member', '#/', ['হ্যাঁ, পেয়েছি', 'সাম্প্রতিক বাজার']],
  ['সদস্য সেটিংস', 'member', '#/settings', ['এই গ্রুপ ছেড়ে যান', 'খাতা ও অ্যাকাউন্ট']],
  ['নতুন ব্যবহারকারী', 'guest', '#/', ['নতুন খাতা তৈরি করুন', 'আমার খাতা খুলুন']],
  ['আমন্ত্রণ-লিংক', 'new', '#/access/aaaaaaaa-2222-4333-8444-555555555555', ['যোগ দিন', 'আপনার নাম']],
];
const notIn = [['সদস্য সেটিংস', 'member', '#/settings', ['পুরো গ্রুপ মুছে ফেলুন', 'অ্যাডমিনের দায়িত্ব']],
               ['সদস্য সদস্য-তালিকা', 'member', '#/members', ['আমন্ত্রণ লিংক তৈরি করুন', 'সরান']]];
let bad = 0;
for (const [name, as, hash, want] of cases) {
  const html = await dom(as, hash);
  const miss = want.filter((t) => !html.includes(t));
  console.log(miss.length ? `✗ ${name}: নেই → ${miss.join(' | ')}` : `✓ ${name}`); bad += miss.length ? 1 : 0;
}
for (const [name, as, hash, nope] of notIn) {
  const html = await dom(as, hash);
  const found = nope.filter((t) => html.includes(t));
  console.log(found.length ? `✗ ${name}: থাকার কথা নয় → ${found.join(' | ')}` : `✓ ${name} (অ্যাডমিন-অংশ নেই)`); bad += found.length ? 1 : 0;
}
server.close();
process.exit(bad ? 1 : 0);
