import { NextResponse } from "next/server";
import { getUserFromRequest, jsonError } from "@/lib/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPayment, pollPayment } from "@/server/payments";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await getUserFromRequest(req);
  if (!user) return jsonError(error || "Unauthorized", 401);

  const { id } = await ctx.params;
  const admin = createAdminClient();
  const payment = await getPayment(admin, id);
  if (!payment || payment.user_id !== user.id) return jsonError("Payment not found.", 404);

  try {
    const current = await pollPayment(admin, payment);
    return NextResponse.json({ payment: current });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Could not check payment status.", 502);
  }
}
