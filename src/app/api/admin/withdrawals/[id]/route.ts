import { NextResponse } from "next/server";
import { adminClient, jsonError, requireAdmin } from "@/lib/server";
import { dispatchWithdrawal, getPayment, settlePayment } from "@/server/payments";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireAdmin(req);
  if (!user) return jsonError(error || "Forbidden", error === "Unauthorized" ? 401 : 403);
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const admin = adminClient();
  const payment = await getPayment(admin, id);
  if (!payment || payment.type !== "WITHDRAWAL") return jsonError("Withdrawal not found.", 404);
  if (payment.status !== "PENDING") return jsonError("Withdrawal is no longer awaiting review.");

  try {
    if (body.action === "reject") {
      const result = await settlePayment(admin, payment.id, false, {
        reason: "Rejected by an administrator.",
        reviewer: user.id,
      });
      return NextResponse.json({ ok: true, result });
    }
    if (body.action !== "approve") return jsonError("Invalid action.");
    if (payment.mode === "MARZPAY") {
      const updated = await dispatchWithdrawal(admin, payment.id, { approvedBy: user.id });
      return NextResponse.json({ ok: true, payment: updated });
    }
    const { data: reviewed, error: updateError } = await admin
      .from("payments")
      .update({ reviewed_by: user.id, reviewed_at: new Date().toISOString() })
      .eq("id", payment.id)
      .eq("status", "PENDING")
      .select("id")
      .maybeSingle();
    if (updateError) return jsonError(updateError.message, 500);
    if (!reviewed) return jsonError("Withdrawal is no longer pending.");
    const result = await settlePayment(admin, payment.id, true, { reviewer: user.id });
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Could not update withdrawal.", 500);
  }
}
