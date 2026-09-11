import { NextResponse } from "next/server";
import { adminClient, assertNotBanned, getSettingsMap, getUserFromRequest, jsonError, settingNum } from "@/lib/server";

export async function POST(req: Request) {
  const { user, error } = await getUserFromRequest(req);
  if (!user) return jsonError(error || "Unauthorized", 401);
  const banned = await assertNotBanned(user.id);
  if (banned.error) return jsonError(banned.error, 403);

  const body = await req.json().catch(() => ({}));
  const amount = Number(body.amount);
  const payment_method = String(body.payment_method || "").trim();
  const transaction_id = String(body.transaction_id || "").trim();
  const sender_phone = String(body.sender_phone || "").trim();
  const sender_name = String(body.sender_name || "").trim() || null;

  if (!["MTN", "Airtel"].includes(payment_method)) return jsonError("Select MTN or Airtel");
  if (!transaction_id) return jsonError("Enter the transaction ID");
  if (!/^0\d{9}$/.test(sender_phone)) return jsonError("Enter a valid phone number");

  const settings = await getSettingsMap();
  const min = settingNum(settings, "min_deposit", 5000);
  const max = settingNum(settings, "max_deposit", 5000000);
  if (!Number.isFinite(amount) || amount < min || amount > max) {
    return jsonError(`Amount must be between UGX ${min.toLocaleString()} and UGX ${max.toLocaleString()}`);
  }

  const admin = adminClient();
  const { data, error: insErr } = await admin
    .from("deposits")
    .insert({
      user_id: user.id,
      amount,
      payment_method,
      transaction_id,
      sender_phone,
      sender_name,
      status: "pending",
    })
    .select("id")
    .single();
  if (insErr) return jsonError(insErr.message);

  return NextResponse.json({ ok: true, id: data.id });
}
