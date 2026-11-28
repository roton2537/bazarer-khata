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
  const chat = new URL(req.url).searchParams.get('source') === 'chat';
  const source = chat ? sb.from('group_chat_messages').select('id,group_id,actor_id:sender_id') : sb.from('events').select('id,group_id,actor_id,kind,message');
  const { data: record, error: lookupError } = await source.eq('id', event_id).maybeSingle();
  if (lookupError) return new Response('event lookup failed', { status: 503 });
  if (!record) return new Response('ignored');

  const { data: grp } = await sb.from('groups').select('name').eq('id', record.group_id).single();
  const { data: members, error: memberError } = await sb.from('members').select('id, user_id').eq('group_id', record.group_id).is('left_on', null).not('user_id', 'is', null);
  if (memberError) return new Response('member lookup failed', {status:503});
  // push_test: শুধু প্রেরককেই পাঠানো হয় (সেটিংস → "পরীক্ষামূলক নোটিফিকেশন")
  const isTest = record.kind === 'push_test';
  const targets = (members ?? []).filter((m) => (isTest ? m.id === record.actor_id : m.id !== record.actor_id)).map((m) => m.user_id);
  if (!targets.length) return new Response('no targets');

  const { data: profs, error: profileError } = await sb.from('profiles').select('id').in('id', targets).eq('push_enabled', true);
  if (profileError) return new Response('profile lookup failed', {status:503});
  let ids = (profs ?? []).map((p) => p.id);
  if (chat && ids.length) {
    const {data: muted, error} = await sb.from('group_chat_mutes').select('user_id').eq('group_id',record.group_id).in('user_id',ids);
    if (error) return new Response('mute lookup failed', {status:503});
    const excluded = new Set(muted.map(row => row.user_id));
    ids = ids.filter(id => !excluded.has(id));
  }
  if (!ids.length) return new Response('no subscribers');
  const { data: subs, error: subscriptionError } = await sb.from('push_subscriptions').select('*').in('user_id', ids);

  if (subscriptionError) return new Response('device lookup failed', {status:503});
  if (!subs?.length) return new Response('no registered devices');
  const payload = JSON.stringify({ title: grp?.name ?? 'বাজারের খাতা', body: chat ? 'গ্রুপ চ্যাট · New message' : record.message, url: chat ? '/?ledger=' + record.group_id + '#/chat' : '/#/feed', tag: record.id });
  const results = await Promise.all(subs.map(async (s) => {
    let endpoint;
    try { endpoint = new URL(s.endpoint); } catch { return; }
    if (endpoint.protocol !== 'https:' || endpoint.port || endpoint.username || endpoint.password) return;
    if (!/^(?:fcm\.googleapis\.com|(?:[a-z0-9-]+\.)*push\.apple\.com|(?:[a-z0-9-]+\.)*push\.services\.mozilla\.com|(?:[a-z0-9-]+\.)*notify\.windows\.com)$/.test(endpoint.hostname)) return;
    try {
      const request = webpush.generateRequestDetails({endpoint:s.endpoint,keys:{p256dh:s.p256dh,auth:s.auth}},payload);
      const response = await fetch(endpoint, {method:'POST', headers:request.headers, body:request.body, redirect:'error'});
      if (response.status === 404 || response.status === 410) {
        await sb.from('push_subscriptions').delete().eq('id',s.id).eq('endpoint',s.endpoint).eq('auth',s.auth);
      }
      return response.status;
    } catch { return 503; }
  }));
  const accepted = results.filter(code => code >= 200 && code < 300).length;
  return Response.json({accepted, attempted:results.length, statuses:results}, {status:accepted ? 200 : 502});
});
