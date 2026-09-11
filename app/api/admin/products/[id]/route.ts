import { NextResponse } from "next/server";
import { adminClient, jsonError, requireAdmin } from "@/lib/server";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireAdmin(req);
  if (!user) return jsonError(error || "Forbidden", error === "Unauthorized" ? 401 : 403);
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const admin = adminClient();
  if (body.delete) {
    const { error: delErr } = await admin.from("investment_products").delete().eq("id", id);
    if (delErr) return jsonError(delErr.message);
    return NextResponse.json({ ok: true });
  }
  const patch: Record<string, unknown> = {};
  for (const key of ["name", "thumbnail_url", "is_active"] as const) {
    if (body[key] !== undefined) patch[key] = body[key];
  }
  if (body.price !== undefined) patch.price = Number(body.price);
  if (body.daily_income !== undefined) patch.daily_income = Number(body.daily_income);
  if (body.validity_days !== undefined) patch.validity_days = Number(body.validity_days);
  const { error: updErr } = await admin.from("investment_products").update(patch).eq("id", id);
  if (updErr) return jsonError(updErr.message);
  return NextResponse.json({ ok: true });
}
