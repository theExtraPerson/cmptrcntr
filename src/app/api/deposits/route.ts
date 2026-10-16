import { NextResponse } from "next/server";
import { getUserFromRequest, jsonError } from "@/lib/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createDeposit } from "@/server/payments";

export async function POST(req: Request) {
  const { user, error } = await getUserFromRequest(req);
  if (!user) return jsonError(error || "Unauthorized", 401);

  const body = await req.json().catch(() => ({}));
  const amount = Number(body.amount);
  const phone = String(body.phone ?? "").trim();
  if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount <= 0) {
    return jsonError("Enter a valid whole-number amount.");
  }

  try {
    const result = await createDeposit(createAdminClient(), user.id, amount, phone);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Could not start the deposit.");
  }
}
