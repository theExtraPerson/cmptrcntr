import { NextResponse } from "next/server";
import { adminClient, jsonError, requireAdmin } from "@/lib/server";

export async function POST(req: Request) {
  const { user, error } = await requireAdmin(req);
  if (!user) return jsonError(error || "Forbidden", error === "Unauthorized" ? 401 : 403);
  const body = await req.json().catch(() => ({}));
  if (!body || typeof body !== "object" || Array.isArray(body)) return jsonError("Invalid product data", 400);
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const price = Number(body.price);
  const dailyIncome = Number(body.daily_income);
  const validityDays = Number(body.validity_days);
  if (!name || !Number.isFinite(price) || price <= 0) return jsonError("Enter a product name and a positive investment amount", 400);
  if (!Number.isFinite(dailyIncome) || dailyIncome <= 0) return jsonError("Daily earnings must be a positive amount", 400);
  if (!Number.isInteger(validityDays) || validityDays <= 0) return jsonError("Duration must be a positive whole number of days", 400);
  if (body.returns_capital !== undefined && typeof body.returns_capital !== "boolean") {
    return jsonError("Capital return setting must be true or false", 400);
  }

  const admin = adminClient();
  const { data, error: insErr } = await admin
    .from("investment_products")
    .insert({
      name,
      price,
      daily_income: dailyIncome,
      validity_days: validityDays,
      returns_capital: body.returns_capital ?? true,
      thumbnail_url: body.thumbnail_url || null,
      is_active: body.is_active !== false,
    })
    .select("*")
    .single();
  if (insErr) return jsonError(insErr.message);
  return NextResponse.json({ ok: true, product: data });
}
