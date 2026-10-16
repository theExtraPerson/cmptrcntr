import { NextResponse } from "next/server";
import { adminClient, jsonError, requireAdmin } from "@/lib/server";

export async function GET(req: Request) {
  const { user, error } = await requireAdmin(req);
  if (!user) return jsonError(error || "Forbidden", error === "Unauthorized" ? 401 : 403);

  const admin = adminClient();
  const { error: prepareError } = await admin.rpc("prepare_investment_payouts", { p_user_id: null });
  if (prepareError) return jsonError(prepareError.message, 500);

  const { data, error: queryError } = await admin
    .from("investment_payouts")
    .select("*, profiles(username, phone), user_investments(product_name, amount, daily_income, validity_days)")
    .eq("status", "PENDING")
    .order("created_at", { ascending: true })
    .limit(100);
  if (queryError) return jsonError(queryError.message, 500);

  return NextResponse.json({ payouts: data ?? [] });
}

export async function POST(req: Request) {
  const { user, error } = await requireAdmin(req);
  if (!user) return jsonError(error || "Forbidden", error === "Unauthorized" ? 401 : 403);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Request body must be valid JSON.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return jsonError("Invalid request body.");
  const payload = body as Record<string, unknown>;
  const payoutId = typeof payload.payout_id === "string" ? payload.payout_id : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payoutId)) {
    return jsonError("A valid payout ID is required.");
  }
  if (payload.action !== "approve") return jsonError("Only the approve action is supported.");

  const { data, error: reviewError } = await adminClient().rpc("review_investment_payout", {
    p_payout_id: payoutId,
    p_reviewer_id: user.id,
  });
  if (reviewError) return jsonError(reviewError.message, 500);
  return NextResponse.json({ ok: true, result: data });
}
