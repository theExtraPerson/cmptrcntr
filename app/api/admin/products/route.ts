import { NextResponse } from "next/server";
import { adminClient, jsonError, requireAdmin } from "@/lib/server";

export async function POST(req: Request) {
  const { user, error } = await requireAdmin(req);
  if (!user) return jsonError(error || "Forbidden", error === "Unauthorized" ? 401 : 403);
  const body = await req.json().catch(() => ({}));
  const admin = adminClient();
  const { data, error: insErr } = await admin
    .from("investment_products")
    .insert({
      name: body.name || null,
      price: Number(body.price),
      daily_income: Number(body.daily_income),
      validity_days: Number(body.validity_days || 4),
      thumbnail_url: body.thumbnail_url || null,
      is_active: body.is_active !== false,
    })
    .select("*")
    .single();
  if (insErr) return jsonError(insErr.message);
  return NextResponse.json({ ok: true, product: data });
}
