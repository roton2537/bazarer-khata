import { createClient } from "npm:@supabase/supabase-js@2";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
};
const reply = (status: number, error?: string) =>
  new Response(JSON.stringify(error ? { error } : { ok: true }), { status, headers });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers });
  if (request.method !== "POST") return reply(405);
  const url = Deno.env.get("SUPABASE_URL")!;
  const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: request.headers.get("Authorization") || "" } },
    auth: { persistSession: false },
  });
  const { data: { user } } = await caller.auth.getUser((request.headers.get("Authorization") || "").replace(/^Bearer /i, ""));
  if (!user || user.email || !user.is_anonymous) return reply(403, "শুধু নিজের আমন্ত্রিত সদস্য অ্যাকাউন্টে লগইন তৈরি করুন।");
  const { data: memberships, error } = await caller.from("members").select("id")
    .eq("user_id", user.id).eq("role", "member").is("left_on", null).limit(1);
  if (error || !memberships?.length) return reply(403, "আগে আমন্ত্রণ গ্রহণ করুন।");
  const body = await request.json().catch(() => null);
  const username = String(body?.username || "").trim().toLowerCase();
  const password = body?.password;
  if (!/^[a-z0-9_]{3,32}$/.test(username) || typeof password !== "string" || password.length < 8 || password.length > 72)
    return reply(400, "ইউজারনেম ৩–৩২ অক্ষর ও পাসওয়ার্ড ৮–৭২ অক্ষর দিন।");
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const result = await admin.auth.admin.updateUserById(user.id, {
    email: username + "@members.bazarer-khata.invalid", email_confirm: true, password,
  });
  return result.error ? reply(409, "লগইন তৈরি হয়নি। অন্য ইউজারনেম বা শক্তিশালী পাসওয়ার্ড চেষ্টা করুন।") : reply(200);
});
