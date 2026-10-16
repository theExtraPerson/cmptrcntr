import { NextResponse } from "next/server";
import { adminClient, assertNotBanned, getUserFromRequest, jsonError } from "@/lib/server";

export async function POST(req: Request) {
  const { user, error } = await getUserFromRequest(req);
  if (!user) return jsonError(error || "Unauthorized", 401);
  const banned = await assertNotBanned(user.id);
  if (banned.error) return jsonError(banned.error, 403);

  const body = await req.json().catch(() => ({}));
  if (!body || typeof body !== "object" || Array.isArray(body)) return jsonError("Invalid product request", 400);
  const product_id = String(body.product_id || "");
  if (!product_id) return jsonError("Missing product", 400);

  const admin = adminClient();
  const { data, error: rpcErr } = await admin.rpc("buy_product", {
    p_user_id: user.id,
    p_product_id: product_id,
  });
  if (rpcErr) return jsonError(rpcErr.message);

  return NextResponse.json({ ok: true, id: data });
}
