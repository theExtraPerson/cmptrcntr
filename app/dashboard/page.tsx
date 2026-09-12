"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BarChart,
  CalendarDays,
  Download,
  History,
  Info,
  KeyRound,
  RefreshCw,
  Send,
  Box,
  Users,
  BanknoteArrowUp,
  BanknoteArrowDown,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { Logo } from "@/components/Logo";
import { Modal } from "@/components/Modal";
import { StatusBadge } from "@/components/StatusBadge";
import { api } from "@/lib/api";
import { getSupabase, ugx, type IncomeRow, type Product, type Story, type Withdrawal } from "@/lib/supabase";

function ActionTile({
  href,
  onClick,
  icon,
  iconSrc,
  label,
}: {
  href?: string;
  onClick?: () => void;
  icon?: React.ReactNode;
  iconSrc?: string;
  label: string;
}) {
  const inner = (
    <>
      {iconSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={iconSrc} alt="" className="h-10 w-10 object-contain" />
      ) : (
        <div className="text-2xl">{icon}</div>
      )}
      <span className="text-sm font-medium">{label}</span>
    </>
  );
  if (href) {
    return (
      <Link href={href} className="dashboard-btn">
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className="dashboard-btn w-full">
      {inner}
    </button>
  );
}

export default function DashboardPage() {
  const { profile, isAdmin, settings, refresh } = useAuth();
  const router = useRouter();
  const [stories, setStories] = useState<Story[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [sheet, setSheet] = useState<"income" | "withdraw" | "password" | "table" | null>(null);
  const [income, setIncome] = useState<IncomeRow[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    refresh();
    const supabase = getSupabase();
    supabase.from("success_stories").select("*").eq("is_published", true).order("created_at", { ascending: false }).then(({ data }) => {
      setStories((data as Story[]) ?? []);
    });
    supabase.from("investment_products").select("*").eq("is_active", true).order("price").then(({ data }) => {
      setProducts((data as Product[]) ?? []);
    });
  }, [refresh]);

  async function openIncome() {
    const { data } = await getSupabase()
      .from("income_history")
      .select("*")
      .neq("type", "deposit")
      .order("created_at", { ascending: false })
      .limit(50);
    setIncome((data as IncomeRow[]) ?? []);
    setSheet("income");
  }
  async function openWithdraw() {
    const { data } = await getSupabase().from("withdrawals").select("*").order("created_at", { ascending: false }).limit(50);
    setWithdrawals((data as Withdrawal[]) ?? []);
    setSheet("withdraw");
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/account/password", { method: "POST", body: JSON.stringify({ password }) });
      toast.success("Password updated");
      setSheet(null);
      setPassword("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  const support = settings.telegram_support || "https://t.me/vivianfibot";
  const group = settings.telegram_group || "https://t.me/+vzcgwRPI9m5lOTY8";

  return (
    <AppShell>
      <div className="px-4 pb-8 pt-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <Logo size={44} />
            <div>
              <p className="text-xs text-muted-foreground">Welcome back,</p>
              <h1 className="text-lg font-medium leading-tight">{profile?.username}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => refresh()}
              className="flex items-center gap-1 rounded-full border bg-card px-3 py-1.5 text-xs"
            >
              <RefreshCw size={12} /> Refresh
            </button>
            {isAdmin ? (
              <button
                type="button"
                onClick={() => router.push("/admin")}
                className="rounded-full bg-violet-600 px-3 py-1.5 text-xs font-medium text-white"
              >
                Admin
              </button>
            ) : null}
          </div>
        </div>

        <div className="hero-stats-card mb-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-lg font-medium">{ugx(profile?.total_deposits)}</p>
              <p className="text-xs text-muted-foreground">Total deposits</p>
            </div>
            <div>
              <p className="text-lg font-medium">{ugx(profile?.total_income)}</p>
              <p className="text-xs text-muted-foreground">Total income</p>
            </div>
            <div>
              <p className="text-lg font-medium">{ugx(profile?.total_withdrawals)}</p>
              <p className="text-xs text-muted-foreground">Total cash outs</p>
            </div>
          </div>
          <div className="mt-3 text-center">
            <p className="text-xl font-medium">{ugx(profile?.balance)}</p>
            <p className="text-xs text-muted-foreground">Account balance</p>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => router.push("/deposit")} className="rounded-xl bg-emerald-600 py-2.5 text-sm font-medium text-white">
              Recharge
            </button>
            <button type="button" onClick={() => router.push("/withdraw")} className="rounded-xl bg-sky-400 py-2.5 text-sm font-medium text-white">
              Cash Out
            </button>
          </div>
        </div>

        <h2 className="mb-2 text-base font-medium">Quick Actions</h2>
        <div className="mb-6 grid grid-cols-3 gap-3">
          <ActionTile href="/deposit" icon={<BanknoteArrowUp />} label="Recharge" />
          <ActionTile href="/withdraw" icon={<BanknoteArrowDown />} label="Cash Out" />
          <ActionTile href="/team" icon={<Users />} label="Referral" />
          <ActionTile href="/products" icon={<Box />} label="Products" />
          <ActionTile href="/about" icon={<Info />} label="About" />
          <ActionTile href="/investments" icon={<BarChart />} label="My VivianFi Trades" />
        </div>

        <h2 className="mb-2 text-base font-medium">Support</h2>
        <div className="mb-6 grid grid-cols-3 gap-3">
          <ActionTile onClick={() => setSheet("table")} icon={<CalendarDays />} label="Trade Table" />
          <ActionTile href={support} icon={<Send />} label="Telegram Support" />
          <ActionTile href={group} icon={<Info />} label="Telegram Group" />
        </div>

        <h2 className="mb-2 text-base font-medium">Account</h2>
        <div className="mb-6 grid grid-cols-3 gap-3">
          <ActionTile onClick={openIncome} icon={<History />} label="Income History" />
          <ActionTile onClick={openWithdraw} icon={<History />} label="Cash Out History" />
          <ActionTile onClick={() => setSheet("password")} icon={<KeyRound />} label="Change Password" />
          <ActionTile href="/VivianFi.apk" icon={<Download />} label="Download App" />
        </div>

        <h2 className="mb-2 text-base font-medium">Success Stories</h2>
        <div className="space-y-3">
          {stories.length === 0 ? <p className="text-sm text-muted-foreground">No stories yet.</p> : null}
          {stories.map((s) => (
            <div key={s.id} className="card-elevated overflow-hidden">
              {s.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.image_url} alt="" className="h-36 w-full object-cover" />
              ) : null}
              <div className="p-3">
                <p className="font-medium">{s.title}</p>
                <p className="text-sm text-muted-foreground">{s.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Modal open={sheet === "table"} title="Trade Table" onClose={() => setSheet(null)}>
        <div className="space-y-2 text-sm">
          {products.map((p) => (
            <div key={p.id} className="flex justify-between rounded-xl border p-3">
              <span>{p.name || ugx(p.price)}</span>
              <span className="text-primary">
                {Math.round((Number(p.daily_income) / Number(p.price || 1)) * 100)}% · {ugx(p.daily_income)}/day
              </span>
            </div>
          ))}
        </div>
      </Modal>
      <Modal open={sheet === "income"} title="Income History" onClose={() => setSheet(null)}>
        <div className="space-y-2 text-sm">
          {income.length === 0 ? <p className="text-muted-foreground">No records.</p> : null}
          {income.map((row) => (
            <div key={row.id} className="flex justify-between rounded-xl border p-3">
              <div>
                <p className="capitalize">{row.type}</p>
                <p className="text-xs text-muted-foreground">{new Date(row.created_at).toLocaleString()}</p>
              </div>
              <p className="font-medium text-primary">+{ugx(row.amount)}</p>
            </div>
          ))}
        </div>
      </Modal>
      <Modal open={sheet === "withdraw"} title="Withdrawal History" onClose={() => setSheet(null)}>
        <div className="space-y-2 text-sm">
          {withdrawals.length === 0 ? <p className="text-muted-foreground">No records.</p> : null}
          {withdrawals.map((row) => (
            <div key={row.id} className="flex justify-between rounded-xl border p-3">
              <div>
                <p>{ugx(row.amount)}</p>
                <p className="text-xs text-muted-foreground">{new Date(row.created_at).toLocaleString()}</p>
              </div>
              <StatusBadge status={row.status} />
            </div>
          ))}
        </div>
      </Modal>
      <Modal open={sheet === "password"} title="Change Password" onClose={() => setSheet(null)}>
        <form onSubmit={changePassword} className="space-y-3">
          <input className="input-field" type="password" placeholder="New password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button disabled={busy} className="btn-gradient w-full rounded-xl py-3 text-sm">
            Update password
          </button>
        </form>
      </Modal>
    </AppShell>
  );
}
