import { NextResponse } from "next/server";
import { adminClient, getUserFromRequest, jsonError } from "@/lib/server";

export async function POST(req: Request) {
  const { user, error } = await getUserFromRequest(req);
  if (!user) return jsonError(error || "Unauthorized", 401);

  const admin = adminClient();
  const { data, error: rpcErr } = await admin.rpc("process_user_payouts", { p_user_id: user.id });
  if (rpcErr) return jsonError(rpcErr.message);

  return NextResponse.json({ ok: true, ...(data as object) });
}
