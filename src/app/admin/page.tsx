"use client";

import {
  ArrowLeft,
  Bell,
  Box,
  FileText,
  LayoutDashboard,
  Minus,
  Plus,
  Search,
  Settings,
  Shield,
  Users,
  Wallet,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { api } from "@/lib/api";
import { PAYMENT_REVIEW_PREFIX } from "@/lib/types";
import { getSupabase, ugx, type Product, type Profile, type Story } from "@/lib/supabase";
import type { Payment } from "@/lib/types";

type Tab = "overview" | "deposits" | "withdrawals" | "payouts" | "users" | "products" | "stories" | "admins" | "settings";

type InvestmentPayout = {
  id: string;
  user_id: string;
  amount: number;
  earnings_amount: number;
  capital_amount: number;
  created_at: string;
  profiles: { username: string; phone: string } | null;
  user_investments: {
    product_name: string | null;
    amount: number;
    daily_income: number;
    validity_days: number;
    payouts_claimed: number;
  } | null;
};

type Overview = {
  totalUsers: number;
  usersToday: number;
  usersYesterday: number;
  approvedDeposits: number;
  approvedWithdrawals: number;
  pendingDeposits: number;
  pendingWithdrawals: number;
  usersWithProducts: number;
};

const tabs: { id: Tab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "deposits", label: "Deposits", icon: Wallet },
  { id: "withdrawals", label: "Withdrawals", icon: Wallet },
  { id: "payouts", label: "Final payouts", icon: Wallet },
  { id: "users", label: "Users", icon: Users },
  { id: "products", label: "Products", icon: Box },
  { id: "stories", label: "Stories", icon: FileText },
  { id: "admins", label: "Admins", icon: Shield },
  { id: "settings", label: "Settings", icon: Settings },
];

export default function AdminPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [txQuery, setTxQuery] = useState("");
  const [txHits, setTxHits] = useState<{ deposits: Payment[]; withdrawals: Payment[] }>({ deposits: [], withdrawals: [] });

  const loadOverview = useCallback(async () => {
    try {
      const data = await api("/api/admin/overview");
      setOverview(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load overview");
    }
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  return (
    <AppShell admin>
      <header className="sticky top-0 z-40 border-b border-border bg-background px-4 pb-3 pt-4 text-foreground">
        <div className="mb-3 flex items-center gap-3">
          <button type="button" onClick={() => router.push("/dashboard")} className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-lg font-medium">Admin Panel</h1>
            <p className="text-xs text-muted-foreground">Full platform control</p>
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs ${active ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}
              >
                <Icon size={14} /> {t.label}
              </button>
            );
          })}
        </div>
      </header>

      <div className="space-y-4 px-4 py-4">
        {tab === "overview" && !overview ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
        {tab === "overview" && overview ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Total Users" value={String(overview.totalUsers)} />
              <Stat label="Users Today" value={String(overview.usersToday)} accent="text-emerald-600" />
              <Stat label="Users Yesterday" value={String(overview.usersYesterday)} />
              <Stat label="Total Approved Deposits" value={ugx(overview.approvedDeposits)} />
              <Stat label="Total Approved Withdrawals" value={ugx(overview.approvedWithdrawals)} />
              <Stat label="Pending Deposits" value={String(overview.pendingDeposits)} warn />
              <Stat label="Pending Withdrawals" value={String(overview.pendingWithdrawals)} warn />
              <Stat label="Users with Products" value={String(overview.usersWithProducts)} />
            </div>
            <div className="card-elevated flex items-center justify-between p-4">
              <div>
                <p className="font-medium">Force Refresh to Users</p>
                <p className="text-xs text-muted-foreground">Notify all logged-in users to refresh their account</p>
              </div>
              <button
                type="button"
                className="flex items-center gap-1 rounded-full bg-primary px-3 py-2 text-xs text-primary-foreground"
                onClick={async () => {
                  try {
                    await api("/api/admin/force-refresh", { method: "POST" });
                    toast.success("Refresh sent");
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Failed");
                  }
                }}
              >
                <Bell size={14} /> Send
              </button>
            </div>
            <h3 className="font-medium">Search Transaction</h3>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-3.5 text-muted-foreground" />
              <input
                className="input-field pl-9"
                placeholder="Enter transaction ID..."
                value={txQuery}
                onChange={async (e) => {
                  const q = e.target.value;
                  setTxQuery(q);
                  if (q.length < 3) {
                    setTxHits({ deposits: [], withdrawals: [] });
                    return;
                  }
                  try {
                    const data = await api(`/api/admin/search?q=${encodeURIComponent(q)}`);
                    setTxHits(data);
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Could not search transactions");
                  }
                }}
              />
            </div>
            {[...txHits.deposits].map((d) => (
              <div key={d.id} className="card-elevated p-3 text-sm">
                Deposit {ugx(d.amount)} • {d.external_reference} <StatusBadge status={d.status} />
              </div>
            ))}
            {[...txHits.withdrawals].map((w) => (
              <div key={w.id} className="card-elevated p-3 text-sm">
                Withdrawal {ugx(w.amount)} • {w.external_reference} <StatusBadge status={w.status} />
              </div>
            ))}
          </>
        ) : null}
        {tab === "deposits" ? <DepositsTab /> : null}
        {tab === "withdrawals" ? <WithdrawalsTab /> : null}
        {tab === "payouts" ? <InvestmentPayoutsTab /> : null}
        {tab === "users" ? <UsersTab /> : null}
        {tab === "products" ? <ProductsTab /> : null}
        {tab === "stories" ? <StoriesTab /> : null}
        {tab === "admins" ? <AdminsTab /> : null}
        {tab === "settings" ? <SettingsTab /> : null}
      </div>
    </AppShell>
  );
}

function Stat({ label, value, accent, warn }: { label: string; value: string; accent?: string; warn?: boolean }) {
  return (
    <div className={`stat-card ${warn ? "border-amber-200 bg-amber-50" : ""}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-medium ${accent || ""} ${warn ? "text-amber-600" : ""}`}>{value}</p>
    </div>
  );
}

function DepositsTab() {
  const [rows, setRows] = useState<(Payment & { profiles?: { username: string; phone: string } })[]>([]);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    let query = getSupabase()
      .from("payments")
      .select("*, profiles:profiles!payments_user_id_fkey(username, phone)")
      .eq("type", "DEPOSIT")
      .order("created_at", { ascending: false })
      .limit(100);
    if (q) query = query.ilike("external_reference", `%${q}%`);
    const { data, error } = await query;
    if (error) {
      toast.error(error.message);
      return;
    }
    setRows((data as typeof rows) ?? []);
  }, [q]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <h3 className="font-medium">All Deposits</h3>
      <input className="input-field" placeholder="Search by transaction ID..." value={q} onChange={(e) => setQ(e.target.value)} />
      {rows.map((d) => (
        <div key={d.id} className="card-elevated space-y-2 p-3 text-sm">
          <div className="flex justify-between">
            <span>{d.profiles?.username || d.user_id.slice(0, 8)}</span>
            <StatusBadge status={d.status} />
          </div>
          <p>
            {ugx(d.amount)} • {d.mode} {d.provider || ""}
          </p>
          <p className="text-xs text-muted-foreground">{d.phone_number} • {d.external_reference}</p>
          {d.failure_reason ? <p className="text-xs text-amber-700">{d.failure_reason}</p> : null}
          {d.status === "PROCESSING" &&
          d.mode === "MARZPAY" &&
          (d.admin_note?.startsWith(PAYMENT_REVIEW_PREFIX) ||
            d.failure_reason?.startsWith("MarzPay response could not be confirmed")) ? (
            <button
              className="w-full rounded-xl bg-primary py-2 text-primary-foreground"
              type="button"
              onClick={async () => {
                try {
                  await api(`/api/admin/payments/${d.id}`, { method: "POST", body: JSON.stringify({ action: "approve" }) });
                  toast.success("Verified deposit credited");
                  await load();
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Could not verify deposit");
                }
              }}
            >
              Verify with MarzPay and credit
            </button>
          ) : null}
          {d.status === "PENDING" && d.mode === "MANUAL" ? (
            <div className="flex gap-2">
              <button
                className="flex-1 rounded-xl bg-primary py-2 text-primary-foreground"
                type="button"
                onClick={async () => {
                  try {
                    await api(`/api/admin/payments/${d.id}`, { method: "POST", body: JSON.stringify({ action: "approve" }) });
                    toast.success("Deposit credited");
                    await load();
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Could not approve deposit");
                  }
                }}
              >
                Approve
              </button>
              <button
                className="flex-1 rounded-xl bg-primary py-2 text-primary-foreground"
                type="button"
                onClick={async () => {
                  try {
                    await api(`/api/admin/payments/${d.id}`, { method: "POST", body: JSON.stringify({ action: "reject" }) });
                    toast.success("Deposit rejected");
                    await load();
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Could not reject deposit");
                  }
                }}
              >
                Reject
              </button>
            </div>
          ) : null}
        </div>
      ))}
    </>
  );
}

function WithdrawalsTab() {
  const [rows, setRows] = useState<(Payment & { profiles?: { username: string; phone: string } })[]>([]);
  const load = useCallback(async () => {
    const { data, error } = await getSupabase()
      .from("payments")
      .select("*, profiles:profiles!payments_user_id_fkey(username, phone)")
      .eq("type", "WITHDRAWAL")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      toast.error(error.message);
      return;
    }
    setRows((data as typeof rows) ?? []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  return (
    <>
      <h3 className="font-medium">All Withdrawals</h3>
      {rows.map((w) => (
        <div key={w.id} className="card-elevated space-y-2 p-3 text-sm">
          <div className="flex justify-between">
            <span>{w.profiles?.username}</span>
            <StatusBadge status={w.status} />
          </div>
          <p>
            {ugx(w.amount)} • fee {ugx(w.fee)} • net {ugx(w.net_amount)}
          </p>
                <p className="text-xs text-muted-foreground">
                  {w.phone_number} • {w.status === "PENDING" ? "Payout method not selected" : `${w.mode} ${w.provider || ""}`}
                </p>
          {w.failure_reason ? <p className="text-xs text-amber-700">{w.failure_reason}</p> : null}
          {w.status === "PENDING" ? (
                  <div className="grid grid-cols-2 gap-2">
              <button
                      className="rounded-xl bg-primary py-2 text-sm text-primary-foreground"
                type="button"
                onClick={async () => {
                  try {
                          const result = await api(`/api/admin/payments/${w.id}`, { method: "POST", body: JSON.stringify({ action: "approve-marzpay" }) });
                          if (result.payment?.status !== "PROCESSING" && result.payment?.status !== "SUCCESS") {
                      toast.error(result.payment?.failure_reason || "Payout could not be submitted.");
                    } else {
                            toast.success("MarzPay payout submitted");
                    }
                    await load();
                  } catch (err) {
                          toast.error(err instanceof Error ? err.message : "Could not send via MarzPay");
                  }
                }}
              >
                      Pay via MarzPay
                    </button>
                    <button
                      className="rounded-xl border py-2 text-sm"
                      type="button"
                      onClick={async () => {
                        if (!window.confirm(`Confirm you sent ${ugx(w.net_amount)} manually to ${w.phone_number}?`)) return;
                        try {
                          await api(`/api/admin/payments/${w.id}`, { method: "POST", body: JSON.stringify({ action: "approve-manual" }) });
                          toast.success("Manual withdrawal recorded as paid");
                          await load();
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : "Could not record manual payment");
                        }
                      }}
                    >
                      Mark manual paid
              </button>
              <button
                      className="col-span-2 rounded-xl border py-2 text-sm"
                type="button"
                onClick={async () => {
                  try {
                    await api(`/api/admin/payments/${w.id}`, { method: "POST", body: JSON.stringify({ action: "reject" }) });
                    toast.success("Withdrawal rejected");
                    await load();
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Could not reject withdrawal");
                  }
                }}
              >
                Reject
              </button>
            </div>
          ) : null}
          {w.status === "PROCESSING" && w.mode === "MARZPAY" && w.failure_reason ? (
            <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3">
              <p className="text-xs text-amber-900">
                The payout response is uncertain. Check its status in MarzPay before choosing either option.
              </p>
              <div className="flex gap-2">
                <button
                  className="flex-1 rounded-xl bg-primary py-2 text-primary-foreground"
                  type="button"
                  onClick={async () => {
                    try {
                      await api(`/api/admin/payments/${w.id}`, { method: "POST", body: JSON.stringify({ action: "mark-paid" }) });
                      toast.success("Withdrawal marked paid");
                      await load();
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Could not settle withdrawal");
                    }
                  }}
                >
                  Confirm paid
                </button>
                <button
                  className="flex-1 rounded-xl border border-amber-500 py-2 text-amber-900"
                  type="button"
                  onClick={async () => {
                    try {
                      await api(`/api/admin/payments/${w.id}`, { method: "POST", body: JSON.stringify({ action: "confirm-failed" }) });
                      toast.success("Withdrawal refunded");
                      await load();
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Could not refund withdrawal");
                    }
                  }}
                >
                  Confirm not paid & refund
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ))}
    </>
  );
}

function InvestmentPayoutsTab() {
  const [rows, setRows] = useState<InvestmentPayout[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api("/api/admin/investment-payouts");
      setRows(data.payouts as InvestmentPayout[]);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load final payouts");
      toast.error(err instanceof Error ? err.message : "Could not load final payouts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function approve(id: string) {
    setBusy(id);
    try {
      await api("/api/admin/investment-payouts", {
        method: "POST",
        body: JSON.stringify({ payout_id: id, action: "approve" }),
      });
      toast.success("Final payout approved and credited");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not approve final payout");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div>
        <h3 className="font-medium">Final payout eligibility review</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Daily plan earnings are credited at midnight EAT. Review any capital return after the plan term and all daily rewards are complete.
        </p>
      </div>
      {loading ? <p className="text-sm text-muted-foreground">Loading final payouts…</p> : null}
      {loadError ? <p role="alert" className="text-sm text-destructive">{loadError}</p> : null}
      {!loading && !loadError && rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No completed plans are awaiting review.</p>
      ) : null}
      {rows.map((payout) => (
        <article key={payout.id} className="card-elevated space-y-2 p-4 text-sm">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-medium">{payout.profiles?.username || payout.user_id.slice(0, 8)}</p>
              <p className="text-xs text-muted-foreground">{payout.profiles?.phone}</p>
            </div>
            <StatusBadge status="PENDING" />
          </div>
          <p>{payout.user_investments?.product_name || "Computer Center plan"}</p>
          <p className="text-xs text-muted-foreground">
            Plan contribution {ugx(payout.user_investments?.amount)} • queued for review{" "}
            {new Date(payout.created_at).toLocaleString()}
          </p>
          <div className="space-y-1 rounded-xl bg-secondary/60 p-3">
            <p>Daily plan earnings: {ugx(payout.earnings_amount)}</p>
            <p>Eligible capital return: {ugx(payout.capital_amount)}</p>
            <p className="border-t border-border pt-1 font-semibold">Total final payout: {ugx(payout.amount)}</p>
          </div>
          <button
            className="w-full rounded-xl bg-primary py-2 text-primary-foreground disabled:opacity-60"
            type="button"
            disabled={
              busy === payout.id ||
              (payout.user_investments?.payouts_claimed ?? 0) < (payout.user_investments?.validity_days ?? 0)
            }
            onClick={() => approve(payout.id)}
          >
            {busy === payout.id
              ? "Approving…"
              : (payout.user_investments?.payouts_claimed ?? 0) < (payout.user_investments?.validity_days ?? 0)
                ? "Daily rewards release at midnight EAT"
                : "Approve and credit final payout"}
          </button>
        </article>
      ))}
    </>
  );
}

function UsersTab() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<(Profile & { payments: Payment[] })[]>([]);
  const [delta, setDelta] = useState<Record<string, string>>({});
  const load = useCallback(async () => {
    let query = getSupabase()
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(80);
    if (q) query = query.or(`username.ilike.%${q}%,phone.ilike.%${q}%`);
    const { data, error } = await query;
    if (error) {
      toast.error(error.message);
      return;
    }
    const profiles = (data as Profile[]) ?? [];
    if (profiles.length === 0) {
      setRows([]);
      return;
    }
    const { data: payments, error: paymentsError } = await getSupabase()
      .from("payments")
      .select("*")
      .eq("type", "DEPOSIT")
      .in("user_id", profiles.map((profile) => profile.id))
      .order("created_at", { ascending: false })
      .limit(500);
    if (paymentsError) {
      toast.error(paymentsError.message);
      return;
    }
    const byUser = new Map<string, Payment[]>();
    for (const payment of (payments as Payment[]) ?? []) {
      const list = byUser.get(payment.user_id) ?? [];
      list.push(payment);
      byUser.set(payment.user_id, list);
    }
    setRows(profiles.map((profile) => ({ ...profile, payments: byUser.get(profile.id) ?? [] })));
  }, [q]);
  useEffect(() => {
    load();
  }, [load]);

  async function adjustBalance(userId: string, direction: 1 | -1) {
    const amount = Number(delta[userId]);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter a valid positive amount");
      return;
    }

    try {
      await api(`/api/admin/users/${userId}`, {
        method: "POST",
        body: JSON.stringify({ delta: direction * amount }),
      });
      setDelta((current) => ({ ...current, [userId]: "" }));
      toast.success(direction === 1 ? "Balance added" : "Balance deducted");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update balance");
    }
  }

  return (
    <>
      <h3 className="font-medium">Users</h3>
      <input className="input-field" placeholder="Search username or phone" value={q} onChange={(e) => setQ(e.target.value)} />
      {rows.map((u) => (
        <div key={u.id} className="card-elevated space-y-2 p-3 text-sm">
          <div className="flex justify-between">
            <span className="font-medium">{u.username}</span>
            <span>{ugx(u.balance)}</span>
          </div>
          <p className="text-xs text-muted-foreground">{u.phone}</p>
          {u.payments[0] ? (
            <p className="text-xs text-muted-foreground">
              Latest deposit: {ugx(u.payments[0].amount)} • {u.payments[0].phone_number}
              {" • "}
              <StatusBadge status={u.payments[0].status} />
            </p>
          ) : null}
          <div className="flex gap-2">
            <input
              className="input-field"
              type="number"
              min="0"
              step="any"
              placeholder="Amount"
              value={delta[u.id] || ""}
              onChange={(e) => setDelta((s) => ({ ...s, [u.id]: e.target.value }))}
            />
            <button
              className="flex items-center gap-1 rounded-xl bg-primary px-3 text-primary-foreground"
              type="button"
              onClick={() => adjustBalance(u.id, 1)}
            >
              <Plus size={16} /> Add
            </button>
            <button
              className="flex items-center gap-1 rounded-xl bg-primary px-3 text-primary-foreground"
              type="button"
              onClick={() => adjustBalance(u.id, -1)}
            >
              <Minus size={16} /> Deduct
            </button>
          </div>
          <button
            type="button"
            className="w-full rounded-xl border py-2"
            onClick={async () => {
              await api(`/api/admin/users/${u.id}`, { method: "POST", body: JSON.stringify({ banned: !u.is_banned }) });
              toast.success(u.is_banned ? "Unbanned" : "Banned");
              load();
            }}
          >
            {u.is_banned ? "Unban" : "Ban user"}
          </button>
        </div>
      ))}
    </>
  );
}

function ProductsTab() {
  const [rows, setRows] = useState<Product[]>([]);
  const [form, setForm] = useState({
    name: "",
    price: "",
    daily_income: "",
    validity_days: "4",
    returns_capital: true,
  });
  const load = useCallback(async () => {
    const { data } = await getSupabase().from("investment_products").select("*").order("price");
    setRows((data as Product[]) ?? []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  return (
    <>
      <h3 className="font-medium">Products</h3>
      <div className="card-elevated space-y-2 p-3">
        <input className="input-field" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className="input-field" placeholder="Price" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
        <input className="input-field" placeholder="Scheduled amount per day" value={form.daily_income} onChange={(e) => setForm({ ...form, daily_income: e.target.value })} />
        <input className="input-field" type="number" min="1" step="1" placeholder="Duration (days)" value={form.validity_days} onChange={(e) => setForm({ ...form, validity_days: e.target.value })} />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.returns_capital}
            onChange={(e) => setForm({ ...form, returns_capital: e.target.checked })}
          />
          Potential capital return after the plan term (if eligible)
        </label>
        <button
          className="btn-gradient w-full rounded-xl py-2 text-sm"
          type="button"
          onClick={async () => {
            await api("/api/admin/products", { method: "POST", body: JSON.stringify(form) });
            toast.success("Product added");
            setForm({ name: "", price: "", daily_income: "", validity_days: "4", returns_capital: true });
            load();
          }}
        >
          Add product
        </button>
      </div>
      {rows.map((p) => (
        <div key={p.id} className="card-elevated flex items-center justify-between p-3 text-sm">
          <div>
            <p className="font-medium">
              {p.name || ugx(p.price)} • {ugx(p.price)}
            </p>
            <p className="text-muted-foreground">
              Plan schedule {ugx(p.daily_income)}/day • {p.validity_days} days • potential earnings {ugx(p.total_earnings)}
            </p>
            <p className="text-muted-foreground">
              {p.returns_capital ? `Potential capital return: ${ugx(p.price)} if eligible` : "No capital return listed"}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="text-xs"
              onClick={async () => {
                await api(`/api/admin/products/${p.id}`, { method: "POST", body: JSON.stringify({ is_active: !p.is_active }) });
                load();
              }}
            >
              {p.is_active ? "Hide" : "Show"}
            </button>
            <button
              type="button"
              className="text-xs text-destructive"
              onClick={async () => {
                await api(`/api/admin/products/${p.id}`, { method: "POST", body: JSON.stringify({ delete: true }) });
                load();
              }}
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </>
  );
}

function StoriesTab() {
  const [rows, setRows] = useState<Story[]>([]);
  const [form, setForm] = useState({ title: "", description: "", image_url: "" });
  const load = useCallback(async () => {
    const { data } = await getSupabase().from("success_stories").select("*").order("created_at", { ascending: false });
    setRows((data as Story[]) ?? []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  return (
    <>
      <h3 className="font-medium">Stories</h3>
      <div className="card-elevated space-y-2 p-3">
        <input className="input-field" placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <textarea className="input-field" placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <input className="input-field" placeholder="Image URL" value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} />
        <button
          className="btn-gradient w-full rounded-xl py-2 text-sm"
          type="button"
          onClick={async () => {
            await api("/api/admin/stories", { method: "POST", body: JSON.stringify(form) });
            toast.success("Story added");
            setForm({ title: "", description: "", image_url: "" });
            load();
          }}
        >
          Add story
        </button>
      </div>
      {rows.map((s) => (
        <div key={s.id} className="card-elevated p-3 text-sm">
          <p className="font-medium">{s.title}</p>
          <p className="text-muted-foreground">{s.description}</p>
          <button
            type="button"
            className="mt-2 text-xs text-destructive"
            onClick={async () => {
              await api(`/api/admin/stories/${s.id}`, { method: "POST", body: JSON.stringify({ delete: true }) });
              load();
            }}
          >
            Delete
          </button>
        </div>
      ))}
    </>
  );
}

function embedUsername(profiles: { username: string } | { username: string }[] | null | undefined) {
  if (!profiles) return "";
  return Array.isArray(profiles) ? profiles[0]?.username || "" : profiles.username;
}

function AdminsTab() {
  const [username, setUsername] = useState("");
  const [admins, setAdmins] = useState<{ user_id: string; username: string }[]>([]);
  const load = useCallback(async () => {
    const { data } = await getSupabase().from("user_roles").select("user_id, profiles(username)").eq("role", "admin");
    setAdmins(
      (data ?? []).map((row) => ({
        user_id: row.user_id as string,
        username: embedUsername(row.profiles as { username: string } | { username: string }[] | null),
      })),
    );
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  return (
    <>
      <h3 className="font-medium">Admins</h3>
      <div className="flex gap-2">
        <input className="input-field" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
        <button
          className="rounded-xl bg-primary px-3 text-sm text-primary-foreground"
          type="button"
          onClick={async () => {
            await api("/api/admin/roles", { method: "POST", body: JSON.stringify({ username, action: "grant" }) });
            toast.success("Granted");
            setUsername("");
            load();
          }}
        >
          Grant
        </button>
      </div>
      {admins.map((a) => (
        <div key={a.user_id} className="card-elevated flex items-center justify-between p-3 text-sm">
          <span>{a.username}</span>
          <button
            type="button"
            className="text-destructive"
            onClick={async () => {
              await api("/api/admin/roles", { method: "POST", body: JSON.stringify({ username: a.username, action: "revoke" }) });
              load();
            }}
          >
            Revoke
          </button>
        </div>
      ))}
    </>
  );
}

function SettingsTab() {
  const [map, setMap] = useState<Record<string, string>>({});
  useEffect(() => {
    getSupabase()
      .from("platform_settings")
      .select("key,value")
      .then(({ data }) => {
        const next: Record<string, string> = {};
        for (const row of data ?? []) {
          if (!["referral_percent", "mtn_number", "mtn_name", "airtel_number", "airtel_name"].includes(row.key)) {
            next[row.key] = row.value;
          }
        }
        setMap(next);
      });
  }, []);
  return (
    <>
      <h3 className="font-medium">Platform Settings</h3>
      {Object.entries(map).map(([key, value]) => (
        <label key={key} className="card-elevated block p-3 text-sm">
          <span className="text-muted-foreground">{key}</span>
          <input className="input-field mt-1" value={value} onChange={(e) => setMap((s) => ({ ...s, [key]: e.target.value }))} />
        </label>
      ))}
      <button
        className="btn-gradient w-full rounded-xl py-3"
        type="button"
        onClick={async () => {
          await api("/api/admin/settings", { method: "POST", body: JSON.stringify(map) });
          toast.success("Settings saved");
        }}
      >
        Save settings
      </button>
    </>
  );
}
