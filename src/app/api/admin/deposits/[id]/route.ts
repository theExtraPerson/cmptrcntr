import { NextResponse } from "next/server";
import { adminClient, jsonError, requireAdmin } from "@/lib/server";
import { getPayment, settlePayment } from "@/server/payments";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireAdmin(req);
  if (!user) return jsonError(error || "Forbidden", error === "Unauthorized" ? 401 : 403);
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const payment = await getPayment(adminClient(), id);
  if (!payment || payment.type !== "DEPOSIT") return jsonError("Deposit not found.", 404);
  if (payment.mode !== "MANUAL") {
    return jsonError("MarzPay deposits are settled only after provider confirmation.");
  }
  if (body.action !== "approve" && body.action !== "reject") return jsonError("Invalid action.");

  try {
    const result = await settlePayment(adminClient(), id, body.action === "approve", {
      reason: body.action === "reject" ? "Rejected by an administrator." : undefined,
      reviewer: user.id,
    });
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Could not update deposit.", 500);
  }
}
