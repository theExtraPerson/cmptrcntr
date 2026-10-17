"use client";

import { History } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { Modal } from "@/components/Modal";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { api } from "@/lib/api";
import { MIN_WITHDRAWAL } from "@/lib/platform";
import { getSupabase, ugx } from "@/lib/supabase";
import type { Payment } from "@/lib/types";

function nowInHours(start: string, end: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Kampala",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const cur = `${parts.find((p) => p.type === "hour")?.value}:${parts.find((p) => p.type === "minute")?.value}`;
  return cur >= start && cur <= end;
}

export default function WithdrawPage() {
  const { profile, settings, refresh } = useAuth();
  const [amount, setAmount] = useState("");
  const [phone, setPhone] = useState(profile?.phone || "");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Payment[]>([]);
  const [openHist, setOpenHist] = useState(false);
  const [activePaymentId, setActivePaymentId] = useState<string | null>(null);

  useEffect(() => {
    if (profile?.phone) setPhone(profile.phone);
  }, [profile?.phone]);

  const min = Math.max(Number(settings.min_withdrawal || MIN_WITHDRAWAL), MIN_WITHDRAWAL);
  const max = Number(settings.max_withdrawal || 5000000);
  const feePct = Number(settings.withdraw_fee_percent || 20);
  const start = settings.withdraw_start_time || "21:00";
  const end = settings.withdraw_end_time || "22:00";
  const open = nowInHours(start, end);
  const n = Number(amount);
  const fee = Number.isFinite(n) ? Math.round((n * feePct) / 100) : 0;
  const net = Number.isFinite(n) ? n - fee : 0;
  const canSubmit = open && Number.isInteger(n) && n >= min && n <= max && /^0\d{9}$/.test(phone) && Number(profile?.balance || 0) >= n;

  async function loadHistory() {
    const { data, error } = await getSupabase()
      .from("payments")
      .select("*")
      .eq("type", "WITHDRAWAL")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    const payments = (data as Payment[]) ?? [];
    setHistory(payments);
    setActivePaymentId(payments.find((payment) => payment.status === "PROCESSING")?.id ?? null);
    setOpenHist(true);
  }

  useEffect(() => {
    if (!activePaymentId) return;
    let stopped = false;
    const check = () => {
      void api(`/api/payments/${activePaymentId}`)
        .then(async ({ payment }: { payment: Payment }) => {
          if (stopped) return;
          setHistory((rows) => rows.map((row) => (row.id === payment.id ? payment : row)));
          if (payment.status === "SUCCESS") {
            setActivePaymentId(null);
            toast.success("Withdrawal has been paid.");
            await refresh();
          } else if (payment.status === "FAILED" || payment.status === "CANCELLED") {
            setActivePaymentId(null);
            toast.error(payment.failure_reason || "Withdrawal failed.");
            await refresh();
          } else if (payment.status !== "PROCESSING") {
            setActivePaymentId(null);
          }
        })
        .catch((err: unknown) => {
          if (stopped) return;
          setActivePaymentId(null);
          toast.error(err instanceof Error ? err.message : "Could not check withdrawal status.");
        });
    };
    check();
    const timer = window.setInterval(check, 5_000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [activePaymentId, refresh]);

  async function submit() {
    setBusy(true);
    try {
      const result = (await api("/api/withdrawals", {
        method: "POST",
        body: JSON.stringify({ amount: n, phone }),
      })) as { payment: Payment };
      setHistory((rows) => [result.payment, ...rows.filter((row) => row.id !== result.payment.id)]);
      if (result.payment.status === "PROCESSING") setActivePaymentId(result.payment.id);
      toast.success("Withdrawal requested. An administrator must approve the payout.");
      setAmount("");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  const feeHint = useMemo(() => (Number.isFinite(n) && n > 0 ? `Fee ${feePct}% (${ugx(fee)}) • You receive ${ugx(net)}` : `Fee ${feePct}%`), [n, fee, net, feePct]);

  return (
    <AppShell>
      <PageHeader
        title="Cash Out"
        subtitle={`Balance: ${ugx(profile?.balance)}`}
        right={
          <button type="button" onClick={() => void loadHistory().catch((err) => toast.error(err instanceof Error ? err.message : "Could not load history"))} className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <History size={18} />
          </button>
        }
      />
      <div className="space-y-4 px-4 py-4">
        <div className="card-elevated space-y-2 p-4 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Withdrawal terms</p>
          <p>
            You may request one withdrawal of at least {ugx(min)} per Kampala calendar day. Pending requests carry
            forward for administrator review and do not prevent a new request the next day. Only available wallet
            funds can be requested.
          </p>
        </div>
        <div className={`rounded-2xl border p-4 ${open ? "border-primary/40 bg-primary/5" : "border-red-400/40 bg-red-500/10"}`}>
          <p className="font-medium">Withdrawal Hours (Kampala): {start} - {end}</p>
          <p className="text-sm text-muted-foreground">{open ? "Withdrawals are open" : "Withdrawals are currently closed"}</p>
        </div>
        <div className="card-elevated p-4">
          <label className="text-sm">
            Amount (UGX)
            <input className="input-field mt-1" type="number" placeholder="Enter amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <p className="mt-1 text-xs text-muted-foreground">
            Min: {ugx(min)} • Max: {ugx(max)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{feeHint}</p>
        </div>
        <div className="card-elevated p-4">
          <label className="text-sm">
            Phone Number
            <input className="input-field mt-1" placeholder="Input phone number" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
        </div>
        <button disabled={!canSubmit || busy} onClick={submit} className="btn-gradient w-full rounded-xl py-3 disabled:opacity-40">
          {busy ? "Submitting…" : "Request withdrawal"}
        </button>
      </div>
      <Modal open={openHist} title="Withdrawal History" onClose={() => setOpenHist(false)}>
        <div className="space-y-2 text-sm">
          {history.length === 0 ? <p className="text-muted-foreground">No withdrawals yet.</p> : null}
          {history.map((w) => (
            <div key={w.id} className="flex justify-between rounded-xl border p-3">
              <div>
                <p>{ugx(w.amount)}</p>
                <p className="text-xs text-muted-foreground">Net {ugx(w.net_amount)}</p>
                <p className="text-xs text-muted-foreground">{w.phone_number}</p>
              </div>
              <StatusBadge status={w.status} />
            </div>
          ))}
        </div>
      </Modal>
    </AppShell>
  );
}
