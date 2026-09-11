import { NextResponse } from "next/server";
import {
  adminClient,
  assertNotBanned,
  getSettingsMap,
  getUserFromRequest,
  isWithinWithdrawHours,
  jsonError,
  settingNum,
} from "@/lib/server";

export async function POST(req: Request) {
  const { user, error } = await getUserFromRequest(req);
  if (!user) return jsonError(error || "Unauthorized", 401);
  const banned = await assertNotBanned(user.id);
  if (banned.error) return jsonError(banned.error, 403);

  const settings = await getSettingsMap();
  if (!isWithinWithdrawHours(settings)) {
    return jsonError(
      `Withdrawals are currently closed. Hours: ${settings.withdraw_start_time || "09:00"} - ${settings.withdraw_end_time || "23:00"}`,
    );
  }

  const body = await req.json().catch(() => ({}));
  const amount = Number(body.amount);
  const phone = String(body.phone || "").trim();
  if (!/^0\d{9}$/.test(phone)) return jsonError("Enter a valid phone number");

  const min = settingNum(settings, "min_withdrawal", 2000);
  const max = settingNum(settings, "max_withdrawal", 5000000);
  const feePct = settingNum(settings, "withdraw_fee_percent", 20);
  if (!Number.isFinite(amount) || amount < min || amount > max) {
    return jsonError(`Amount must be between UGX ${min.toLocaleString()} and UGX ${max.toLocaleString()}`);
  }

  const fee = Math.round((amount * feePct) / 100);
  const net = amount - fee;
  if (net <= 0) return jsonError("Amount too small after fee");

  const admin = adminClient();
  const { data, error: rpcErr } = await admin.rpc("request_withdraw", {
    p_user_id: user.id,
    p_amount: amount,
    p_fee: fee,
    p_net: net,
    p_phone: phone,
  });
  if (rpcErr) return jsonError(rpcErr.message);

  return NextResponse.json({ ok: true, id: data, fee, net_amount: net });
}
