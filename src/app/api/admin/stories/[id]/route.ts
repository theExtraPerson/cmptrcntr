import { NextResponse } from "next/server";
import { adminClient, jsonError, requireAdmin } from "@/lib/server";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireAdmin(req);
  if (!user) return jsonError(error || "Forbidden", error === "Unauthorized" ? 401 : 403);
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const admin = adminClient();
  if (body.delete) {
    const { error: delErr } = await admin.from("success_stories").delete().eq("id", id);
    if (delErr) return jsonError(delErr.message);
    return NextResponse.json({ ok: true });
  }
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of ["title", "description", "image_url", "is_published"] as const) {
    if (body[key] !== undefined) patch[key] = body[key];
  }
  const { error: updErr } = await admin.from("success_stories").update(patch).eq("id", id);
  if (updErr) return jsonError(updErr.message);
  return NextResponse.json({ ok: true });
}
