import { NextResponse } from "next/server";
import { adminClient, jsonError, requireAdmin } from "@/lib/server";
import { MIN_WITHDRAWAL } from "@/lib/platform";

export async function POST(req: Request) {
  const { user, error } = await requireAdmin(req);
  if (!user) return jsonError(error || "Forbidden", error === "Unauthorized" ? 401 : 403);
  const body = await req.json().catch(() => ({})) as Record<string, string>;
  for (const key of ["referral_level_1_percent", "referral_level_2_percent"]) {
    if (key in body) {
      const rate = Number(body[key]);
      if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
        return jsonError(`${key} must be a percentage from 0 to 100.`, 400);
      }
    }
  }
  if ("min_withdrawal" in body) {
    const minWithdrawal = Number(body.min_withdrawal);
    if (!Number.isFinite(minWithdrawal) || minWithdrawal < MIN_WITHDRAWAL) {
      return jsonError(`min_withdrawal cannot be less than UGX ${MIN_WITHDRAWAL.toLocaleString()}.`, 400);
    }
  }
  const admin = adminClient();
  const rows = Object.entries(body)
    .filter(([key]) => key)
    .map(([key, value]) => ({ key, value: String(value ?? ""), updated_at: new Date().toISOString() }));
  if (!rows.length) return jsonError("No settings");
  const { error: upsertErr } = await admin.from("platform_settings").upsert(rows);
  if (upsertErr) return jsonError(upsertErr.message);
  return NextResponse.json({ ok: true });
}
