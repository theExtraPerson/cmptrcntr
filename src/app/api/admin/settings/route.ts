import { NextResponse } from "next/server";
import { adminClient, jsonError, requireAdmin } from "@/lib/server";

export async function POST(req: Request) {
  const { user, error } = await requireAdmin(req);
  if (!user) return jsonError(error || "Forbidden", error === "Unauthorized" ? 401 : 403);
  const body = await req.json().catch(() => ({})) as Record<string, string>;
  const admin = adminClient();
  const rows = Object.entries(body)
    .filter(([key]) => key)
    .map(([key, value]) => ({ key, value: String(value ?? ""), updated_at: new Date().toISOString() }));
  if (!rows.length) return jsonError("No settings");
  const { error: upsertErr } = await admin.from("platform_settings").upsert(rows);
  if (upsertErr) return jsonError(upsertErr.message);
  return NextResponse.json({ ok: true });
}
