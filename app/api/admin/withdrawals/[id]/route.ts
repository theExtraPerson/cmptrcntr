import { NextResponse } from "next/server";
import { adminClient, jsonError, requireAdmin } from "@/lib/server";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireAdmin(req);
  if (!user) return jsonError(error || "Forbidden", error === "Unauthorized" ? 401 : 403);
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "");
  const admin = adminClient();
  const fn = action === "approve" ? "approve_withdraw" : action === "reject" ? "reject_withdraw" : null;
  if (!fn) return jsonError("Invalid action");
  const { error: rpcErr } = await admin.rpc(fn, { p_withdrawal_id: id });
  if (rpcErr) return jsonError(rpcErr.message);
  return NextResponse.json({ ok: true });
}
