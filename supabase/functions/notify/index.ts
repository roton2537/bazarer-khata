// পুশ নোটিফিকেশন পাঠায়। Supabase Dashboard → Database → Webhooks এ `events` টেবিলের INSERT-এ এই ফাংশন যুক্ত করুন।
// প্রয়োজনীয় secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:...), WEBHOOK_SECRET
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT')!, Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!);

Deno.serve(async (req) => {
  if (req.headers.get('x-webhook-secret') !== Deno.env.get('WEBHOOK_SECRET')) return new Response('forbidden', { status: 403 });
  const { record } = await req.json();
  if (!record?.group_id) return new Response('ignored');

  const { data: grp } = await sb.from('groups').select('name').eq('id', record.group_id).single();
  const { data: members } = await sb.from('members').select('id, user_id').eq('group_id', record.group_id).is('left_on', null).not('user_id', 'is', null);
  const targets = (members ?? []).filter((m) => m.id !== record.actor_id).map((m) => m.user_id);
  if (!targets.length) return new Response('no targets');

  const { data: profs } = await sb.from('profiles').select('id').in('id', targets).eq('push_enabled', true);
  const ids = (profs ?? []).map((p) => p.id);
  if (!ids.length) return new Response('no subscribers');
  const { data: subs } = await sb.from('push_subscriptions').select('*').in('user_id', ids);

  const payload = JSON.stringify({ title: grp?.name ?? 'বাজারের খাতা', body: record.message, url: '/#/feed', tag: record.id });
  await Promise.all((subs ?? []).map(async (s) => {
    try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload); }
    catch (e) { if (e.statusCode === 404 || e.statusCode === 410) await sb.from('push_subscriptions').delete().eq('id', s.id); }
  }));
  return new Response('ok');
});
