"use client";

import { CalendarDays, Check } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { PageHeader } from "@/components/PageHeader";
import { api } from "@/lib/api";
import { getSupabase, ugx, type Product } from "@/lib/supabase";

function dailyRatio(p: Product) {
  const price = Number(p.price);
  if (!price) return 0;
  return Math.round((Number(p.daily_income) / price) * 100);
}

export default function ProductsPage() {
  const { profile, refresh } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    getSupabase()
      .from("investment_products")
      .select("*")
      .eq("is_active", true)
      .order("price")
      .then(({ data }) => setProducts((data as Product[]) ?? []));
  }, []);

  async function trade(id: string) {
    setBusy(id);
    try {
      await api("/api/products/buy", { method: "POST", body: JSON.stringify({ product_id: id }) });
      toast.success("Machine activated");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Trade failed");
    } finally {
      setBusy(null);
    }
  }

  const balance = Number(profile?.balance || 0);

  return (
    <AppShell>
      <PageHeader title="Quantitative Products" subtitle="Activate a plan to start earning" back={false} />
      <div className="space-y-4 px-4 py-4">
        <div className="card-elevated overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/get_started.jpg" alt="" className="w-full object-cover" />
          <div className="p-4">
            <h3 className="font-medium">How it works</h3>
            <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
              <li>• Trade a quantitative product to start daily income</li>
              <li>• Profit ratio rises with size: 20% up to 26% daily</li>
              <li>• Income is credited every 24 hours for 4 days</li>
              <li>• Your capital is refunded after 4 days</li>
              <li>• Activate multiple products for more income</li>
            </ul>
          </div>
        </div>
        <div className="card-elevated overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/quantitative_plan_table.jpg" alt="Earnings table" className="w-full object-cover" />
        </div>

        {products.map((p) => {
          const canTrade = balance >= Number(p.price);
          const ratio = dailyRatio(p);
          return (
            <div key={p.id} className="card-elevated overflow-hidden">
              <div className="machine-card-image">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/hero_image.jpg" alt={p.name || "Product"} />
                <p className="absolute bottom-2 left-4 z-10 text-xl font-medium text-white">
                  {p.name || ugx(p.price)}
                </p>
              </div>
              <div className="space-y-3 p-4">
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div className="rounded-xl bg-secondary/60 p-3">
                    <p className="text-xs text-muted-foreground">Trade</p>
                    <p className="font-medium">{ugx(p.price)}</p>
                  </div>
                  <div className="rounded-xl bg-secondary/60 p-3">
                    <p className="text-xs text-muted-foreground">Daily</p>
                    <p className="font-medium text-primary">{ugx(p.daily_income)}</p>
                  </div>
                  <div className="rounded-xl bg-secondary/60 p-3">
                    <p className="text-xs text-muted-foreground">Ratio</p>
                    <p className="font-medium">{ratio}%</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Total in {p.validity_days} days {ugx(Number(p.daily_income) * p.validity_days)}
                </p>
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <CalendarDays size={14} /> Valid for {p.validity_days} days
                  <span>•</span>
                  <Check size={14} className="text-primary" /> Capital returned
                </p>
                <button
                  disabled={!canTrade || busy === p.id}
                  onClick={() => trade(p.id)}
                  className="btn-gradient w-full rounded-xl py-3 text-sm disabled:opacity-40"
                >
                  {busy === p.id ? "Activating…" : "Trade Now"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </AppShell>
  );
}
