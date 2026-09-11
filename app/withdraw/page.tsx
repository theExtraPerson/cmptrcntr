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
import { getSupabase, ugx, type Withdrawal } from "@/lib/supabase";

function nowInHours(start: string, end: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Nairobi",
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
  const [history, setHistory] = useState<Withdrawal[]>([]);
  const [openHist, setOpenHist] = useState(false);

  useEffect(() => {
    if (profile?.phone) setPhone(profile.phone);
  }, [profile?.phone]);

  const min = Number(settings.min_withdrawal || 2000);
  const max = Number(settings.max_withdrawal || 5000000);
  const feePct = Number(settings.withdraw_fee_percent || 20);
  const start = settings.withdraw_start_time || "09:00";
  const end = settings.withdraw_end_time || "23:00";
  const open = nowInHours(start, end);
  const n = Number(amount);
  const fee = Number.isFinite(n) ? Math.round((n * feePct) / 100) : 0;
  const net = Number.isFinite(n) ? n - fee : 0;
  const canSubmit = open && Number.isFinite(n) && n >= min && n <= max && /^0\d{9}$/.test(phone) && Number(profile?.balance || 0) >= n;

  async function loadHistory() {
    const { data } = await getSupabase().from("withdrawals").select("*").order("created_at", { ascending: false }).limit(50);
    setHistory((data as Withdrawal[]) ?? []);
    setOpenHist(true);
  }

  async function submit() {
    setBusy(true);
    try {
      await api("/api/withdrawals", { method: "POST", body: JSON.stringify({ amount: n, phone }) });
      toast.success("Withdrawal requested");
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
          <button type="button" onClick={loadHistory} className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20 text-white">
            <History size={18} />
          </button>
        }
      />
      <div className="space-y-4 px-4 py-4">
        <div className="card-elevated overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/withdraw_rules.jpg" alt="Withdraw rules" className="w-full object-cover" />
        </div>
        <div className={`rounded-2xl border p-4 ${open ? "border-violet-400/40 bg-violet-500/10" : "border-red-400/40 bg-red-500/10"}`}>
          <p className="font-medium">Withdrawal Hours: {start} - {end}</p>
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
            <input className="input-field mt-1" placeholder="0700000000" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
        </div>
        <button disabled={!canSubmit || busy} onClick={submit} className="btn-gradient w-full rounded-xl py-3 disabled:opacity-40">
          {busy ? "Submitting…" : "Apply for a Withdraw"}
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
              </div>
              <StatusBadge status={w.status} />
            </div>
          ))}
        </div>
      </Modal>
    </AppShell>
  );
}
