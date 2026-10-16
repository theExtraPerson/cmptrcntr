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
import { getSupabase, ugx, type IncomeRow, type Product, type Story } from "@/lib/supabase";
import type { Payment } from "@/lib/types";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

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
  const [withdrawals, setWithdrawals] = useState<Payment[]>([]);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const handleAppInstalled = () => setInstallPrompt(null);
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

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
    const { data, error } = await getSupabase()
      .from("payments")
      .select("*")
      .eq("type", "WITHDRAWAL")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      toast.error(error.message);
      return;
    }
    setWithdrawals((data as Payment[]) ?? []);
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

  async function installApp() {
    if (!installPrompt) {
      toast("Use your browser menu and choose 'Install Computer Center' or 'Add to Home screen'.");
      return;
    }
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }

  const support = settings.telegram_support;
  const group = settings.whatsapp_group;

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
                className="rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
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
              <p className="text-xs text-muted-foreground">Total withdrawals</p>
            </div>
          </div>
          <div className="mt-3 text-center">
            <p className="text-xl font-medium">{ugx(profile?.balance)}</p>
            <p className="text-xs text-muted-foreground">Account balance</p>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => router.push("/deposit")} className="rounded-xl bg-primary py-2.5 text-sm font-medium text-primary-foreground">
              Deposit
            </button>
            <button type="button" onClick={() => router.push("/withdraw")} className="rounded-xl bg-primary py-2.5 text-sm font-medium text-primary-foreground">
              Withdraw
            </button>
          </div>
        </div>

        <h2 className="mb-2 text-base font-medium">Quick Actions</h2>
        <div className="mb-6 grid grid-cols-3 gap-3">
          <ActionTile href="/deposit" icon={<BanknoteArrowUp />} label="Deposit" />
          <ActionTile href="/withdraw" icon={<BanknoteArrowDown />} label="Withdraw" />
          <ActionTile href="/team" icon={<Users />} label="Referral" />
          <ActionTile href="/products" icon={<Box />} label="Products" />
          <ActionTile href="/about" icon={<Info />} label="About" />
          <ActionTile href="/investments" icon={<BarChart />} label="My Plans" />
        </div>

        <h2 className="mb-2 text-base font-medium">Support</h2>
        <div className="mb-6 grid grid-cols-3 gap-3">
          <ActionTile onClick={() => setSheet("table")} icon={<CalendarDays />} label="Plan Table" />
          {support ? <ActionTile href={support} icon={<Send />} label="Support" /> : null}
          {group ? <ActionTile href={group} icon={<Info />} label="WhatsApp Community" /> : null}
        </div>
        {!support && !group ? <p className="mb-6 text-xs text-muted-foreground">Support contact details are not configured yet.</p> : null}

        <h2 className="mb-2 text-base font-medium">Account</h2>
        <div className="mb-6 grid grid-cols-3 gap-3">
          <ActionTile onClick={openIncome} icon={<History />} label="Income History" />
          <ActionTile onClick={openWithdraw} icon={<History />} label="Withdrawal History" />
          <ActionTile onClick={() => setSheet("password")} icon={<KeyRound />} label="Change Password" />
          <ActionTile onClick={installApp} icon={<Download />} label="Download App" />
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

      <Modal open={sheet === "table"} title="Partnership Plan Figures" onClose={() => setSheet(null)}>
        <div className="space-y-2 text-sm">
          <p className="text-xs text-muted-foreground">
            Figures describe the selected plan schedule, not guaranteed returns. No daily withdrawals are made;
            eligible final payouts require completion of the plan term and review.
          </p>
          {products.map((p) => (
            <div key={p.id} className="space-y-1 rounded-xl border p-3">
              <div className="flex justify-between gap-2">
                <span className="font-medium">{p.name || ugx(p.price)}</span>
                <span>{ugx(p.price)} investment</span>
              </div>
              <p className="text-muted-foreground">
                Plan schedule {ugx(p.daily_income)}/day · {p.validity_days} days · potential earnings {ugx(p.total_earnings)}
              </p>
              <p className="text-xs text-muted-foreground">
                Final payout after the plan term only, subject to terms and review. No daily withdrawals.
              </p>
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
                <p>
                  {row.type === "referral_l1"
                    ? "Level 1 referral commission"
                    : row.type === "referral_l2"
                      ? "Level 2 referral commission"
                      : row.type === "plan_earnings"
                        ? "Eligible plan earnings (final payout)"
                        : row.type.replaceAll("_", " ")}
                </p>
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
