import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function getUserFromRequest(req: Request) {
  const auth = req.headers.get("authorization");
  if (!auth) return { user: null, error: "Unauthorized" };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const client = createClient(url, anon, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return { user: null, error: "Unauthorized" };
  return { user: data.user, error: null };
}

export async function requireAdmin(req: Request) {
  const { user, error } = await getUserFromRequest(req);
  if (!user) return { user: null, error: error ?? "Unauthorized" };
  const admin = adminClient();
  const { data } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) return { user: null, error: "Forbidden" };
  return { user, error: null };
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function jsonOk(body: unknown = { ok: true }, status = 200) {
  return NextResponse.json(body, { status });
}

export async function getSettingsMap() {
  const admin = adminClient();
  const { data } = await admin.from("platform_settings").select("key,value");
  const map: Record<string, string> = {};
  for (const row of data ?? []) map[row.key] = row.value;
  return map;
}

export function settingNum(settings: Record<string, string>, key: string, fallback: number) {
  const n = Number(settings[key]);
  return Number.isFinite(n) ? n : fallback;
}

export function isWithinWithdrawHours(settings: Record<string, string>, now = new Date()) {
  const start = settings.withdraw_start_time || "09:00";
  const end = settings.withdraw_end_time || "23:00";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Nairobi",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const hh = parts.find((p) => p.type === "hour")?.value ?? "00";
  const mm = parts.find((p) => p.type === "minute")?.value ?? "00";
  const cur = `${hh}:${mm}`;
  return cur >= start && cur <= end;
}

export async function assertNotBanned(userId: string) {
  const admin = adminClient();
  const { data } = await admin.from("profiles").select("is_banned").eq("id", userId).maybeSingle();
  if (!data) return { error: "Profile not found" };
  if (data.is_banned) return { error: "Account banned" };
  return { error: null };
}
