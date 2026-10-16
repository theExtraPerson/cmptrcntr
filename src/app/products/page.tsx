"use client";

import { BadgeCheck, CalendarDays, Coins, Laptop, Monitor } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { PageHeader } from "@/components/PageHeader";
import { api } from "@/lib/api";
import { getSupabase, ugx, type Product } from "@/lib/supabase";

function productIcon(name: string | null) {
  return name === "Desk PC" ? Monitor : Laptop;
}

export default function ProductsPage() {
  const { profile, refresh } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function loadProducts() {
      try {
        const { data, error } = await getSupabase()
          .from("investment_products")
          .select("*")
          .eq("is_active", true)
          .order("price");
        if (error) {
          throw error;
        }
        if (mounted) setProducts((data as Product[]) ?? []);
      } catch (error) {
        console.error("Could not load investment products", error);
        if (mounted) setLoadError("Could not load product plans. Please try again.");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void loadProducts();
    return () => {
      mounted = false;
    };
  }, []);

  async function trade(id: string) {
    const product = products.find((item) => item.id === id);
    if (!product) return;
    const confirmed = window.confirm(
      `Start ${product.name || "this partnership plan"} for ${ugx(product.price)}? This amount will be deducted from your available balance. The listed earnings and any capital return are conditional on the plan terms and review; no daily withdrawals are made.`,
    );
    if (!confirmed) return;

    setBusy(id);
    try {
      await api("/api/products/buy", { method: "POST", body: JSON.stringify({ product_id: id }) });
      toast.success("Partnership plan started. Eligible final payouts are reviewed after the plan duration.");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Purchase failed");
    } finally {
      setBusy(null);
    }
  }

  const balance = Number(profile?.balance || 0);

  return (
    <AppShell>
      <PageHeader title="Partnership Plans" subtitle="Review plan figures, duration, conditions, and risks" back={false} />
      <div className="space-y-4 px-4 py-4">
        <div className="card-elevated overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/product-chart.jpg"
            alt="Computer Center partnership plan figures including contribution, daily schedule, duration, and potential final amounts"
            className="mx-auto max-h-[70vh] w-full bg-deep-twilight object-contain"
          />
          <div className="space-y-2 p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">How plan payouts work</p>
            <p>
              The plan contribution is deducted from your available balance. The listed daily figure describes the
              plan schedule; it is not a daily payment or a guaranteed return. After the full duration, eligible
              earnings and any applicable capital return accumulate into one final payout, subject to the plan terms,
              confirmed business results, and admin review.
            </p>
            <p>Partnership carries financial risk. Review the terms and only participate if you understand them.</p>
            <p className="font-medium text-foreground">Available balance: {ugx(balance)}</p>
          </div>
        </div>

        {loading ? <p className="text-sm text-muted-foreground">Loading products…</p> : null}
        {loadError ? <p role="alert" className="text-sm text-destructive">{loadError}</p> : null}
        {!loading && !loadError && products.length === 0 ? (
          <p className="text-sm text-muted-foreground">No products are currently available.</p>
        ) : null}

        {products.map((product) => {
          const ProductIcon = productIcon(product.name);
          const canBuy = balance >= Number(product.price);
          return (
            <article key={product.id} className="card-elevated overflow-hidden">
              <div className="flex items-center gap-3 border-b border-border p-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <ProductIcon size={26} />
                </span>
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold">{product.name || "Computer Center Product"}</h2>
                  <p className="text-sm text-muted-foreground">Plan contribution {ugx(product.price)}</p>
                </div>
                <Coins className="ml-auto shrink-0 text-primary" size={20} />
              </div>

              <dl className="grid grid-cols-2 gap-2 p-4 text-sm">
                <div className="rounded-xl bg-secondary/60 p-3">
                  <dt className="text-xs text-muted-foreground">Plan schedule per day</dt>
                  <dd className="mt-1 font-semibold text-primary">{ugx(product.daily_income)}</dd>
                </div>
                <div className="rounded-xl bg-secondary/60 p-3">
                  <dt className="text-xs text-muted-foreground">Duration</dt>
                  <dd className="mt-1 flex items-center gap-1 font-semibold">
                    <CalendarDays size={14} /> {product.validity_days} days
                  </dd>
                </div>
                <div className="rounded-xl bg-secondary/60 p-3">
                  <dt className="text-xs text-muted-foreground">Potential scheduled earnings</dt>
                  <dd className="mt-1 font-semibold">{ugx(product.total_earnings)}</dd>
                </div>
                <div className="rounded-xl bg-secondary/60 p-3">
                  <dt className="text-xs text-muted-foreground">Potential capital return</dt>
                  <dd className="mt-1 flex items-center gap-1 font-semibold">
                    {product.returns_capital ? (
                      <><BadgeCheck size={15} className="text-primary" /> {ugx(product.price)} if eligible</>
                    ) : (
                      "Not returned"
                    )}
                  </dd>
                </div>
              </dl>

              <div className="px-4 pb-4">
                <button
                  disabled={!canBuy || busy === product.id}
                  onClick={() => trade(product.id)}
                  className="btn-gradient w-full rounded-xl py-3 text-sm disabled:opacity-40"
                >
                  {busy === product.id
                    ? "Activating…"
                    : canBuy
                      ? "Start partnership plan"
                      : `Need ${ugx(Number(product.price) - balance)} more`}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </AppShell>
  );
}
