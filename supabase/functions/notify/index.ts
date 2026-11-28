import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const candidate = webpush.generateVAPIDKeys();

Deno.serve(async (req) => {
  const webhook = req.headers.get('x-webhook-secret');
  if (req.method !== 'POST' || !webhook) return new Response('forbidden', { status: 403 });
  const { data: keys, error } = await sb.rpc('push_sender_keys', { webhook, candidate });
  if (error) return new Response('configuration unavailable', { status: 503 });
  if (!keys) return new Response('forbidden', { status: 403 });
  if (!keys.privateKey || !keys.publicKey) return new Response('invalid configuration', { status: 503 });
  webpush.setVapidDetails('https://bazarer-khata-ten.vercel.app', keys.publicKey, keys.privateKey);
  const { event_id } = await req.json();
  if (!event_id) return new Response('ready');
  const { data: record, error: lookupError } = await sb.from('events').select('id,group_id,actor_id,kind,message').eq('id', event_id).maybeSingle();
  if (lookupError) return new Response('event lookup failed', { status: 503 });
  if (!record) return new Response('ignored');

  const { data: grp } = await sb.from('groups').select('name').eq('id', record.group_id).single();
  const { data: members } = await sb.from('members').select('id, user_id').eq('group_id', record.group_id).is('left_on', null).not('user_id', 'is', null);
  // push_test: শুধু প্রেরককেই পাঠানো হয় (সেটিংস → "পরীক্ষামূলক নোটিফিকেশন")
  const isTest = record.kind === 'push_test';
  const targets = (members ?? []).filter((m) => (isTest ? m.id === record.actor_id : m.id !== record.actor_id)).map((m) => m.user_id);
  if (!targets.length) return new Response('no targets');

  const { data: profs } = await sb.from('profiles').select('id').in('id', targets).eq('push_enabled', true);
  const ids = (profs ?? []).map((p) => p.id);
  if (!ids.length) return new Response('no subscribers');
  const { data: subs } = await sb.from('push_subscriptions').select('*').in('user_id', ids);

  const payload = JSON.stringify({ title: grp?.name ?? 'বাজারের খাতা', body: record.message, url: '/#/feed', tag: record.id });
  await Promise.all((subs ?? []).map(async (s) => {
    let endpoint;
    try { endpoint = new URL(s.endpoint); } catch { return; }
    if (endpoint.protocol !== 'https:' || endpoint.port || endpoint.username || endpoint.password) return;
    if (!/^(?:fcm\.googleapis\.com|(?:[a-z0-9-]+\.)*push\.apple\.com|(?:[a-z0-9-]+\.)*push\.services\.mozilla\.com|(?:[a-z0-9-]+\.)*notify\.windows\.com)$/.test(endpoint.hostname)) return;
    try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload); }
    catch (e) { if (e.statusCode === 404 || e.statusCode === 410) await sb.from('push_subscriptions').delete().eq('id', s.id); }
  }));
  return new Response('ok');
});
