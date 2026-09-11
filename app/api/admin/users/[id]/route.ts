import { NextResponse } from "next/server";
import { adminClient, jsonError, requireAdmin } from "@/lib/server";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireAdmin(req);
  if (!user) return jsonError(error || "Forbidden", error === "Unauthorized" ? 401 : 403);
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const admin = adminClient();

  if (body.banned !== undefined) {
    const { error: updErr } = await admin.from("profiles").update({ is_banned: Boolean(body.banned) }).eq("id", id);
    if (updErr) return jsonError(updErr.message);
  }
  if (body.delta !== undefined) {
    const delta = Number(body.delta);
    if (!Number.isFinite(delta) || delta === 0) return jsonError("Enter a valid amount");
    const { error: rpcErr } = await admin.rpc("adjust_user_balance", { p_user_id: id, p_delta: delta });
    if (rpcErr) return jsonError(rpcErr.message);
  }
  return NextResponse.json({ ok: true });
}
