import { NextResponse } from "next/server";
import { adminClient, jsonError, requireAdmin } from "@/lib/server";

export async function POST(req: Request) {
  const { user, error } = await requireAdmin(req);
  if (!user) return jsonError(error || "Forbidden", error === "Unauthorized" ? 401 : 403);
  const body = await req.json().catch(() => ({}));
  const username = String(body.username || "").trim();
  const action = String(body.action || "grant");
  const admin = adminClient();
  const { data: profile } = await admin.from("profiles").select("id").ilike("username", username).maybeSingle();
  if (!profile) return jsonError("User not found");
  if (action === "revoke") {
    const { error: delErr } = await admin.from("user_roles").delete().eq("user_id", profile.id).eq("role", "admin");
    if (delErr) return jsonError(delErr.message);
  } else {
    const { error: insErr } = await admin.from("user_roles").insert({ user_id: profile.id, role: "admin" });
    if (insErr && !/duplicate|unique/i.test(insErr.message)) return jsonError(insErr.message);
  }
  return NextResponse.json({ ok: true });
}
