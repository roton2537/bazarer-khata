create extension if not exists pg_net with schema extensions;

-- The service role initializes the signing keys after the first authenticated callback.
select vault.create_secret(gen_random_uuid()::text || gen_random_uuid()::text, 'messmate_push_webhook')
where not exists (select 1 from vault.secrets where name = 'messmate_push_webhook');

create or replace function public.push_sender_keys(webhook text, candidate jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare expected text; saved text;
begin
  select decrypted_secret into strict expected from vault.decrypted_secrets where name = 'messmate_push_webhook';
  if webhook is null or webhook <> expected then return null; end if;
  select decrypted_secret into saved from vault.decrypted_secrets where name = 'messmate_push_vapid';
  if saved is null then
    perform pg_catalog.pg_advisory_xact_lock(192403778);
    select decrypted_secret into saved from vault.decrypted_secrets where name = 'messmate_push_vapid';
    if saved is null then
      perform vault.create_secret(candidate::text, 'messmate_push_vapid');
      return candidate;
    end if;
  end if;
  return saved::jsonb;
end $$;
revoke all on function public.push_sender_keys(text,jsonb) from public, anon, authenticated;
grant execute on function public.push_sender_keys(text,jsonb) to service_role;

create or replace function public.dispatch_push_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare webhook text;
begin
  select decrypted_secret into strict webhook from vault.decrypted_secrets where name = 'messmate_push_webhook';
  perform net.http_post(url := TG_ARGV[0], headers := jsonb_build_object('Content-Type','application/json','x-webhook-secret',webhook), body := jsonb_build_object('event_id',new.id));
  return new;
end $$;
revoke all on function public.dispatch_push_event() from public, anon, authenticated;
create trigger messmate_dispatch_push after insert on public.events for each row
execute function public.dispatch_push_event('https://arhublkcafbotpcyaphg.supabase.co/functions/v1/notify');
revoke all privileges on table net.http_request_queue, net._http_response from public, anon, authenticated;
