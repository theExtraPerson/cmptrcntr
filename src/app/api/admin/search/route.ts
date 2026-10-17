import { NextResponse } from "next/server";
import { adminClient, jsonError, requireAdmin } from "@/lib/server";

export async function GET(req: Request) {
  const { user, error } = await requireAdmin(req);
  if (!user) return jsonError(error || "Forbidden", error === "Unauthorized" ? 401 : 403);
  const q = new URL(req.url).searchParams.get("q")?.trim() || "";
  if (!q) return NextResponse.json({ deposits: [], withdrawals: [] });

  const admin = adminClient();
  const find = async (type: "DEPOSIT" | "WITHDRAWAL") => {
    const columns = ["external_reference", "provider_reference", "provider_tx_uuid"] as const;
    const responses = await Promise.all(
      columns.map((column) =>
        admin
          .from("payments")
          .select("*, profiles:profiles!payments_user_id_fkey(username, phone)")
          .eq("type", type)
          .ilike(column, `%${q}%`)
          .limit(20),
      ),
    );
    const errors = responses.filter((response) => response.error).map((response) => response.error?.message);
    if (errors.length) throw new Error(errors.join("; "));
    const unique = new Map<string, unknown>();
    for (const response of responses) {
      for (const payment of response.data ?? []) unique.set(payment.id, payment);
    }
    return [...unique.values()];
  };

  try {
    const [deposits, withdrawals] = await Promise.all([find("DEPOSIT"), find("WITHDRAWAL")]);
    return NextResponse.json({ deposits, withdrawals });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Could not search payment records.", 500);
  }
}
