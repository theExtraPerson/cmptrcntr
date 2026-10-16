import { NextResponse } from "next/server";
import { adminClient, jsonError, requireAdmin } from "@/lib/server";
import { PAYMENT_REVIEW_PREFIX } from "@/lib/types";
import { dispatchWithdrawal, getPayment, settlePayment } from "@/server/payments";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireAdmin(req);
  if (!user) return jsonError(error || "Forbidden", error === "Unauthorized" ? 401 : 403);

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");
  const admin = adminClient();
  const payment = await getPayment(admin, id);
  if (!payment) return jsonError("Payment not found.", 404);
  const reviewMarked = payment.admin_note?.startsWith(PAYMENT_REVIEW_PREFIX) ?? false;
  const manualResolution =
    payment.status === "PROCESSING" &&
    ((payment.type === "DEPOSIT" &&
      payment.mode === "MARZPAY" &&
      (reviewMarked || payment.failure_reason?.startsWith("MarzPay response could not be confirmed"))) ||
      (payment.type === "WITHDRAWAL" && payment.mode === "MARZPAY" && !!payment.failure_reason));
  if (payment.status !== "PENDING" && !manualResolution) {
    return jsonError("Payment is no longer awaiting review.");
  }

  try {
    if (action === "reject") {
      if (payment.status !== "PENDING") {
        return jsonError("Confirm that the MarzPay payout was not sent before releasing the reserved balance.");
      }
      if (payment.type === "DEPOSIT" && payment.mode === "MARZPAY") {
        return jsonError("A MarzPay deposit cannot be rejected before the provider confirms its result.");
      }
      const result = await settlePayment(admin, payment.id, false, {
        reason: "Rejected by an administrator.",
        reviewer: user.id,
      });
      return NextResponse.json({ ok: true, result });
    }

    if (payment.status === "PROCESSING") {
      if (
        payment.type === "DEPOSIT" &&
        action === "approve" &&
        (reviewMarked || payment.failure_reason?.startsWith("MarzPay response could not be confirmed"))
      ) {
        const result = await settlePayment(admin, payment.id, true, { reviewer: user.id });
        return NextResponse.json({ ok: true, result });
      }
      if (payment.type === "WITHDRAWAL" && action === "mark-paid") {
        const result = await settlePayment(admin, payment.id, true, { reviewer: user.id });
        return NextResponse.json({ ok: true, result });
      }
      if (payment.type === "WITHDRAWAL" && action === "confirm-failed") {
        const result = await settlePayment(admin, payment.id, false, {
          reason: "Administrator confirmed the payout was not sent.",
          reviewer: user.id,
        });
        return NextResponse.json({ ok: true, result });
      }
      return jsonError("Confirm the payment status with MarzPay before resolving it.");
    }

    if (action !== "approve") return jsonError("Invalid action.");
    if (payment.type === "DEPOSIT") {
      if (payment.mode !== "MANUAL") {
        return jsonError("MarzPay deposits are settled only after provider confirmation.");
      }
      const result = await settlePayment(admin, payment.id, true, { reviewer: user.id });
      return NextResponse.json({ ok: true, result });
    }

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
    return jsonError(err instanceof Error ? err.message : "Could not update payment.", 500);
  }
}
