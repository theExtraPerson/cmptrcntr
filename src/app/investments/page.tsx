"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { getSupabase, ugx, type Investment } from "@/lib/supabase";

type PayoutRecord = {
  id: string;
  investment_id: string;
  amount: number;
  earnings_amount: number;
  capital_amount: number;
  status: "PENDING" | "APPROVED";
  created_at: string;
};

export default function InvestmentsPage() {
  const { refresh } = useAuth();
  const [rows, setRows] = useState<Investment[]>([]);
  const [payouts, setPayouts] = useState<PayoutRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function loadInvestments() {
      try {
        await refresh();
        const supabase = getSupabase();
        const { data, error } = await supabase
          .from("user_investments")
          .select("*")
          .order("created_at", { ascending: false });
        if (error) throw error;
        const { data: payoutData, error: payoutError } = await supabase
          .from("investment_payouts")
          .select("id,investment_id,amount,earnings_amount,capital_amount,status,created_at")
          .order("created_at", { ascending: false });
        if (payoutError) throw payoutError;
        if (mounted) {
          setRows((data as Investment[]) ?? []);
          setPayouts((payoutData as PayoutRecord[]) ?? []);
        }
      } catch (error) {
        console.error("Could not load investments", error);
        if (mounted) setLoadError("Could not load your partnership plans. Please refresh and try again.");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void loadInvestments();
    return () => {
      mounted = false;
    };
  }, [refresh]);

  const active = rows.filter((r) => r.is_active).length;
  const payoutByInvestment = new Map(payouts.map((payout) => [payout.investment_id, payout]));

  return (
    <AppShell>
      <PageHeader title="My Partnership Plans" subtitle={`${active} active plans`} />
      <div className="space-y-3 px-4 py-4">
        {loading ? <p className="text-sm text-muted-foreground">Loading your products…</p> : null}
        {loadError ? <p role="alert" className="text-sm text-destructive">{loadError}</p> : null}
        {!loading && !loadError && rows.length === 0 ? <p className="text-sm text-muted-foreground">No products yet.</p> : null}
        {rows.map((inv) => {
          const payout = payoutByInvestment.get(inv.id);
          const endsAt = new Date(new Date(inv.created_at).getTime() + inv.validity_days * 24 * 60 * 60 * 1000);
          return (
            <div key={inv.id} className="card-elevated space-y-1 p-4 text-sm">
              <div className="flex justify-between">
                <div>
                  <p className="font-medium">{inv.product_name || "Computer Center Product"}</p>
                  <p className="text-xs text-muted-foreground">Plan contribution {ugx(inv.amount)}</p>
                </div>
                <p className={inv.is_active ? "text-primary" : "text-muted-foreground"}>
                  {payout?.status === "PENDING" ? "Awaiting final review" : inv.is_active ? "Active" : "Completed"}
                </p>
              </div>
              <p className="text-muted-foreground">
                Plan schedule: {ugx(inv.daily_income)} per day for {inv.validity_days} days
              </p>
              <p className="text-xs text-muted-foreground">
                No daily withdrawals. Potential earnings and any capital return are conditional on plan terms, business
                results, and review.
              </p>
              <p className="text-xs text-muted-foreground">
                After the term ends, refresh your account to prepare the final payout request for admin review.
              </p>
              {payout ? (
                <div className="mt-2 space-y-1 rounded-xl bg-secondary/60 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">Final payout: {ugx(payout.amount)}</p>
                    <StatusBadge status={payout.status} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Eligible accumulated earnings: {ugx(payout.earnings_amount)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Potential capital return: {ugx(payout.capital_amount)}
                  </p>
                  {payout.status === "PENDING" ? (
                    <p className="text-xs text-muted-foreground">
                      No funds are credited unless the final payout is approved.
                    </p>
                  ) : null}
                </div>
              ) : inv.is_active ? (
                <p className="text-xs text-muted-foreground">
                  Plan duration ends {endsAt.toLocaleString()}. Final payout review follows the completed term.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {inv.capital_returned ? `Final capital return recorded: ${ugx(inv.amount)}` : "Plan completed."}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </AppShell>
  );
}
