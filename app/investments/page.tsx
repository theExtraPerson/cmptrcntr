"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { PageHeader } from "@/components/PageHeader";
import { getSupabase, ugx, type Investment } from "@/lib/supabase";

export default function InvestmentsPage() {
  const { refresh } = useAuth();
  const [rows, setRows] = useState<Investment[]>([]);

  useEffect(() => {
    refresh().then(() => {
      getSupabase()
        .from("user_investments")
        .select("*")
        .order("created_at", { ascending: false })
        .then(({ data }) => setRows((data as Investment[]) ?? []));
    });
  }, [refresh]);

  const active = rows.filter((r) => r.is_active).length;

  return (
    <AppShell>
      <PageHeader title="My Trades" subtitle={`${active} active machines`} />
      <div className="space-y-3 px-4 py-4">
        {rows.length === 0 ? <p className="text-sm text-muted-foreground">No trades yet.</p> : null}
        {rows.map((inv) => (
          <div key={inv.id} className="card-elevated p-4 text-sm">
            <div className="flex justify-between">
              <p className="font-medium">{ugx(inv.amount)}</p>
              <p className={inv.is_active ? "text-primary" : "text-muted-foreground"}>{inv.is_active ? "Active" : "Completed"}</p>
            </div>
            <p className="mt-1 text-muted-foreground">Daily {ugx(inv.daily_income)}</p>
            <p className="text-muted-foreground">
              {inv.payouts_claimed} paid • {inv.days_remaining} days left
            </p>
            {inv.is_active ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Next income {new Date(inv.next_payout_at).toLocaleString()}
              </p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">Capital returned</p>
            )}
          </div>
        ))}
      </div>
    </AppShell>
  );
}
