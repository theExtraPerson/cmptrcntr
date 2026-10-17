import { NextResponse } from "next/server";
import { getUserFromRequest, getSettingsMap, isWithinWithdrawHours, jsonError, settingNum } from "@/lib/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { detectProvider, toMsisdn } from "@/lib/phone";
import { MIN_WITHDRAWAL } from "@/lib/platform";
import type { Payment } from "@/lib/types";

export async function POST(req: Request) {
  const { user, error } = await getUserFromRequest(req);
  if (!user) return jsonError(error || "Unauthorized", 401);

  const body = await req.json().catch(() => ({}));
  const amount = Number(body.amount);
  const msisdn = toMsisdn(String(body.phone ?? "").trim());
  if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount <= 0) {
    return jsonError("Enter a valid whole-number amount.");
  }
  if (!msisdn) return jsonError("Enter a valid Ugandan mobile number.");

  const provider = detectProvider(msisdn);
  if (!provider) return jsonError("This mobile network is not supported for withdrawals.");
  const settings = await getSettingsMap();
  if (!isWithinWithdrawHours(settings)) {
    return jsonError(
      `Withdrawals are currently closed. Hours: ${settings.withdraw_start_time || "21:00"} - ${settings.withdraw_end_time || "22:00"}`,
    );
  }

  const min = Math.max(settingNum(settings, "min_withdrawal", MIN_WITHDRAWAL), MIN_WITHDRAWAL);
  const max = settingNum(settings, "max_withdrawal", 5_000_000);
  const feePct = settingNum(settings, "withdraw_fee_percent", 20);
  if (amount < min || amount > max) {
    return jsonError(`Amount must be between UGX ${min.toLocaleString()} and UGX ${max.toLocaleString()}`);
  }
  const fee = Math.round((amount * feePct) / 100);
  const net = amount - fee;
  if (net <= 0) return jsonError("Amount too small after fee.");

  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("is_banned")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) return jsonError(profileError.message, 500);
  if (!profile) return jsonError("Profile not found.", 404);
  if (profile.is_banned) return jsonError("Account banned.", 403);

  const { data, error: rpcError } = await admin.rpc("request_payment_withdraw", {
    p_user_id: user.id,
    p_amount: amount,
    p_fee: fee,
    p_net: net,
    p_phone: msisdn,
    p_provider: provider,
  });
  if (rpcError) return jsonError(rpcError.message);
  const { data: payment, error: paymentError } = await admin
    .from("payments")
    .select("*")
    .eq("id", data)
    .single();
  if (paymentError) return jsonError(paymentError.message, 500);

  return NextResponse.json({ payment: payment as Payment, fee, net_amount: net }, { status: 201 });
}
