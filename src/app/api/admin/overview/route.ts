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

  const [{ count: totalUsers }, { count: usersToday }, { count: usersYesterday }, payments, investments] =
    await Promise.all([
      admin.from("profiles").select("*", { count: "exact", head: true }),
      admin.from("profiles").select("*", { count: "exact", head: true }).gte("created_at", startToday.toISOString()),
      admin
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .gte("created_at", startYesterday.toISOString())
        .lt("created_at", startToday.toISOString()),
      admin.from("payments").select("type,amount,status"),
      admin.from("user_investments").select("user_id").eq("is_active", true),
    ]);

  const rows = payments.data ?? [];
  const approvedDeposits = rows
    .filter((payment) => payment.type === "DEPOSIT" && payment.status === "SUCCESS")
    .reduce((s, d) => s + Number(d.amount), 0);
  const approvedWithdrawals = rows
    .filter((payment) => payment.type === "WITHDRAWAL" && payment.status === "SUCCESS")
    .reduce((s, d) => s + Number(d.amount), 0);
  const pendingDeposits = rows.filter(
    (payment) => payment.type === "DEPOSIT" && ["PENDING", "PROCESSING"].includes(payment.status),
  ).length;
  const pendingWithdrawals = rows.filter(
    (payment) => payment.type === "WITHDRAWAL" && ["PENDING", "PROCESSING"].includes(payment.status),
  ).length;
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
