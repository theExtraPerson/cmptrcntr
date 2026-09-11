import { NextResponse } from "next/server";
import { adminClient, jsonError, requireAdmin } from "@/lib/server";

export async function GET(req: Request) {
  const { user, error } = await requireAdmin(req);
  if (!user) return jsonError(error || "Forbidden", error === "Unauthorized" ? 401 : 403);
  const q = new URL(req.url).searchParams.get("q")?.trim() || "";
  if (!q) return NextResponse.json({ deposits: [], withdrawals: [] });
  const admin = adminClient();
  const [{ data: deposits }, { data: withdrawals }] = await Promise.all([
    admin.from("deposits").select("*, profiles(username, phone)").ilike("transaction_id", `%${q}%`).limit(20),
    admin.from("withdrawals").select("*, profiles(username, phone)").eq("id", q).limit(20),
  ]);
  return NextResponse.json({ deposits: deposits ?? [], withdrawals: withdrawals ?? [] });
}
