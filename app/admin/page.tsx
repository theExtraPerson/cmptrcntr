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
import { getSupabase, ugx, type Deposit, type Product, type Profile, type Story, type Withdrawal } from "@/lib/supabase";

type Tab = "overview" | "deposits" | "withdrawals" | "users" | "products" | "stories" | "admins" | "settings";

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
  const [txHits, setTxHits] = useState<{ deposits: Deposit[]; withdrawals: Withdrawal[] }>({ deposits: [], withdrawals: [] });

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
      <header className="sticky top-0 z-40 bg-[#12081f] px-4 pb-3 pt-4 text-white">
        <div className="mb-3 flex items-center gap-3">
          <button type="button" onClick={() => router.push("/dashboard")} className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-lg font-medium">Admin Panel</h1>
            <p className="text-xs text-white/70">Full platform control</p>
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
                className={`flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs ${active ? "bg-fuchsia-600 text-white" : "bg-white/10"}`}
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
                className="flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-2 text-xs text-white"
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
                  const data = await api(`/api/admin/search?q=${encodeURIComponent(q)}`);
                  setTxHits(data);
                }}
              />
            </div>
            {[...txHits.deposits].map((d) => (
              <div key={d.id} className="card-elevated p-3 text-sm">
                Deposit {ugx(d.amount)} • {d.transaction_id} <StatusBadge status={d.status} />
              </div>
            ))}
          </>
        ) : null}
        {tab === "deposits" ? <DepositsTab /> : null}
        {tab === "withdrawals" ? <WithdrawalsTab /> : null}
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
  const [rows, setRows] = useState<(Deposit & { profiles?: { username: string; phone: string } })[]>([]);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    let query = getSupabase().from("deposits").select("*, profiles(username, phone)").order("created_at", { ascending: false }).limit(100);
    if (q) query = query.ilike("transaction_id", `%${q}%`);
    const { data } = await query;
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
            {ugx(d.amount)} • {d.payment_method}
          </p>
          <p className="text-xs text-muted-foreground">{d.sender_phone} by {d.profiles?.username}</p>
          {d.status === "pending" ? (
            <div className="flex gap-2">
              <button
                className="flex-1 rounded-xl bg-emerald-600 py-2 text-white"
                type="button"
                onClick={async () => {
                  await api(`/api/admin/deposits/${d.id}`, { method: "POST", body: JSON.stringify({ action: "approve" }) });
                  toast.success("Approved");
                  load();
                }}
              >
                Approve
              </button>
              <button
                className="flex-1 rounded-xl bg-red-500 py-2 text-white"
                type="button"
                onClick={async () => {
                  await api(`/api/admin/deposits/${d.id}`, { method: "POST", body: JSON.stringify({ action: "reject" }) });
                  toast.success("Rejected");
                  load();
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
  const [rows, setRows] = useState<(Withdrawal & { profiles?: { username: string; phone: string } })[]>([]);
  const load = useCallback(async () => {
    const { data } = await getSupabase()
      .from("withdrawals")
      .select("*, profiles(username, phone)")
      .order("created_at", { ascending: false })
      .limit(100);
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
            {ugx(w.amount)} net {ugx(w.net_amount)}
          </p>
          <p className="text-xs text-muted-foreground">{w.profiles?.phone}</p>
          {w.status === "pending" ? (
            <div className="flex gap-2">
              <button
                className="flex-1 rounded-xl bg-emerald-600 py-2 text-white"
                type="button"
                onClick={async () => {
                  await api(`/api/admin/withdrawals/${w.id}`, { method: "POST", body: JSON.stringify({ action: "approve" }) });
                  toast.success("Approved");
                  load();
                }}
              >
                Approve
              </button>
              <button
                className="flex-1 rounded-xl bg-red-500 py-2 text-white"
                type="button"
                onClick={async () => {
                  await api(`/api/admin/withdrawals/${w.id}`, { method: "POST", body: JSON.stringify({ action: "reject" }) });
                  toast.success("Rejected");
                  load();
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

function UsersTab() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Profile[]>([]);
  const [delta, setDelta] = useState<Record<string, string>>({});
  const load = useCallback(async () => {
    let query = getSupabase().from("profiles").select("*").order("created_at", { ascending: false }).limit(80);
    if (q) query = query.or(`username.ilike.%${q}%,phone.ilike.%${q}%`);
    const { data } = await query;
    setRows((data as Profile[]) ?? []);
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
              className="flex items-center gap-1 rounded-xl bg-emerald-600 px-3 text-white"
              type="button"
              onClick={() => adjustBalance(u.id, 1)}
            >
              <Plus size={16} /> Add
            </button>
            <button
              className="flex items-center gap-1 rounded-xl bg-rose-600 px-3 text-white"
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
  const [form, setForm] = useState({ name: "", price: "", daily_income: "", validity_days: "4" });
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
        <input className="input-field" placeholder="Daily income" value={form.daily_income} onChange={(e) => setForm({ ...form, daily_income: e.target.value })} />
        <button
          className="btn-gradient w-full rounded-xl py-2 text-sm"
          type="button"
          onClick={async () => {
            await api("/api/admin/products", { method: "POST", body: JSON.stringify(form) });
            toast.success("Product added");
            setForm({ name: "", price: "", daily_income: "", validity_days: "4" });
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
            <p className="text-muted-foreground">Daily {ugx(p.daily_income)}</p>
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
          className="rounded-xl bg-emerald-600 px-3 text-sm text-white"
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
        for (const row of data ?? []) next[row.key] = row.value;
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
