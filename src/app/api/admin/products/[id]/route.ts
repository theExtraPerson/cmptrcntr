import { NextResponse } from "next/server";
import { adminClient, jsonError, requireAdmin } from "@/lib/server";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireAdmin(req);
  if (!user) return jsonError(error || "Forbidden", error === "Unauthorized" ? 401 : 403);
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  if (!body || typeof body !== "object" || Array.isArray(body)) return jsonError("Invalid product data", 400);
  const admin = adminClient();
  if (body.delete) {
    const { error: delErr } = await admin.from("investment_products").delete().eq("id", id);
    if (delErr) return jsonError(delErr.message);
    return NextResponse.json({ ok: true });
  }
  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim()) return jsonError("Product name cannot be empty", 400);
    patch.name = body.name.trim();
  }
  for (const key of ["price", "daily_income"] as const) {
    if (body[key] !== undefined) {
      const value = Number(body[key]);
      if (!Number.isFinite(value) || value <= 0) return jsonError(`${key} must be a positive amount`, 400);
      patch[key] = value;
    }
  }
  if (body.validity_days !== undefined) {
    const validityDays = Number(body.validity_days);
    if (!Number.isInteger(validityDays) || validityDays <= 0) {
      return jsonError("Duration must be a positive whole number of days", 400);
    }
    patch.validity_days = validityDays;
  }
  for (const key of ["is_active", "returns_capital"] as const) {
    if (body[key] !== undefined) {
      if (typeof body[key] !== "boolean") return jsonError(`${key} must be true or false`, 400);
      patch[key] = body[key];
    }
  }
  if (body.thumbnail_url !== undefined) {
    if (body.thumbnail_url !== null && typeof body.thumbnail_url !== "string") {
      return jsonError("Thumbnail URL must be text or null", 400);
    }
    patch.thumbnail_url = body.thumbnail_url;
  }
  if (Object.keys(patch).length === 0) return jsonError("No product fields to update", 400);
  const { error: updErr } = await admin.from("investment_products").update(patch).eq("id", id);
  if (updErr) return jsonError(updErr.message);
  return NextResponse.json({ ok: true });
}
