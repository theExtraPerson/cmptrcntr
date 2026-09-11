import { NextResponse } from "next/server";
import { adminClient, jsonError, requireAdmin } from "@/lib/server";

export async function GET(req: Request) {
  const { user, error } = await requireAdmin(req);
  if (!user) return jsonError(error || "Forbidden", error === "Unauthorized" ? 401 : 403);

  const admin = adminClient();
  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);
  const startYesterday = new Date(startToday);
  startYesterday.setDate(startYesterday.getDate() - 1);

  const [{ count: totalUsers }, { count: usersToday }, { count: usersYesterday }, deposits, withdrawals, investments] =
    await Promise.all([
      admin.from("profiles").select("*", { count: "exact", head: true }),
      admin.from("profiles").select("*", { count: "exact", head: true }).gte("created_at", startToday.toISOString()),
      admin
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .gte("created_at", startYesterday.toISOString())
        .lt("created_at", startToday.toISOString()),
      admin.from("deposits").select("amount,status"),
      admin.from("withdrawals").select("amount,status"),
      admin.from("user_investments").select("user_id").eq("is_active", true),
    ]);

  const approvedDeposits = (deposits.data ?? [])
    .filter((d) => d.status === "approved")
    .reduce((s, d) => s + Number(d.amount), 0);
  const approvedWithdrawals = (withdrawals.data ?? [])
    .filter((d) => d.status === "approved")
    .reduce((s, d) => s + Number(d.amount), 0);
  const pendingDeposits = (deposits.data ?? []).filter((d) => d.status === "pending").length;
  const pendingWithdrawals = (withdrawals.data ?? []).filter((d) => d.status === "pending").length;
  const usersWithProducts = new Set((investments.data ?? []).map((r) => r.user_id)).size;

  return NextResponse.json({
    totalUsers: totalUsers ?? 0,
    usersToday: usersToday ?? 0,
    usersYesterday: usersYesterday ?? 0,
    approvedDeposits,
    approvedWithdrawals,
    pendingDeposits,
    pendingWithdrawals,
    usersWithProducts,
  });
}
