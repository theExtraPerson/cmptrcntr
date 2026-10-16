import { NextResponse } from "next/server";
import { adminClient, jsonError, requireAdmin } from "@/lib/server";

export async function POST(req: Request) {
  const { user, error } = await requireAdmin(req);
  if (!user) return jsonError(error || "Forbidden", error === "Unauthorized" ? 401 : 403);
  const admin = adminClient();
  const { error: updErr } = await admin
    .from("platform_settings")
    .upsert({ key: "force_refresh_timestamp", value: String(Date.now()), updated_at: new Date().toISOString() });
  if (updErr) return jsonError(updErr.message);
  return NextResponse.json({ ok: true });
}
