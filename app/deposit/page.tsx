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
import { getSupabase, ugx, type Deposit } from "@/lib/supabase";

export default function DepositPage() {
  const { profile, settings } = useAuth();
  const [amount, setAmount] = useState("");
  const [phone, setPhone] = useState(profile?.phone || "");
  const [method, setMethod] = useState<"MTN" | "Airtel" | "">("");
  const [step, setStep] = useState<1 | 2>(1);
  const [tx, setTx] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Deposit[]>([]);
  const [openHist, setOpenHist] = useState(false);

  useEffect(() => {
    if (profile?.phone) setPhone(profile.phone);
  }, [profile?.phone]);

  const min = Number(settings.min_deposit || 5000);
  const max = Number(settings.max_deposit || 5000000);
  const n = Number(amount);
  const payTo = useMemo(() => {
    if (method === "MTN") return { number: settings.mtn_number, name: settings.mtn_name };
    if (method === "Airtel") return { number: settings.airtel_number, name: settings.airtel_name };
    return { number: "", name: "" };
  }, [method, settings]);

  const canContinue = Number.isFinite(n) && n >= min && n <= max && /^0\d{9}$/.test(phone) && !!method;

  async function loadHistory() {
    const { data } = await getSupabase().from("deposits").select("*").order("created_at", { ascending: false }).limit(50);
    setHistory((data as Deposit[]) ?? []);
    setOpenHist(true);
  }

  async function submit() {
    setBusy(true);
    try {
      await api("/api/deposits", {
        method: "POST",
        body: JSON.stringify({
          amount: n,
          payment_method: method,
          transaction_id: tx,
          sender_phone: phone,
        }),
      });
      toast.success("Deposit submitted. Wait for approval.");
      setStep(1);
      setAmount("");
      setTx("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <PageHeader
        title="Recharge"
        right={
          <button type="button" onClick={loadHistory} className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20 text-white">
            <History size={18} />
          </button>
        }
      />
      <div className="space-y-4 px-4 py-4">
        {step === 1 ? (
          <>
            <div className="card-elevated p-4">
              <label className="text-sm">
                Amount (UGX)
                <input className="input-field mt-1" type="number" placeholder="Enter amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </label>
              <p className="mt-1 text-xs text-muted-foreground">
                Min: {ugx(min)} • Max: {ugx(max)}
              </p>
            </div>
            <div className="card-elevated p-4">
              <label className="text-sm">
                Your Phone Number
                <input className="input-field mt-1" placeholder="0700000000" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </label>
            </div>
            <h2 className="text-base font-medium">Select Payment Method</h2>
            <button
              type="button"
              onClick={() => setMethod("MTN")}
              className={`card-elevated w-full p-4 text-left ${method === "MTN" ? "ring-2 ring-primary" : ""}`}
            >
              MTN Uganda
            </button>
            <button
              type="button"
              onClick={() => setMethod("Airtel")}
              className={`card-elevated w-full p-4 text-left ${method === "Airtel" ? "ring-2 ring-primary" : ""}`}
            >
              Airtel Uganda
            </button>
            <button disabled={!canContinue} onClick={() => setStep(2)} className="btn-gradient w-full rounded-xl py-3 disabled:opacity-40">
              Continue
            </button>
          </>
        ) : (
          <>
            <div className="card-elevated space-y-2 p-4 text-sm">
              <p>
                Your are depositing <span className="font-medium">{ugx(n)}</span> via {method} to:
              </p>
              <p className="text-lg font-medium">{payTo.number}</p>
              <p className="text-muted-foreground">{payTo.name}</p>
            </div>
            <div className="card-elevated p-4">
              <label className="text-sm">
                Names
                <input className="input-field mt-1" placeholder="Enter your names" value={tx} onChange={(e) => setTx(e.target.value)} />
              </label>
            </div>
            <button disabled={busy || !tx.trim()} onClick={submit} className="btn-gradient w-full rounded-xl py-3 disabled:opacity-40">
              {busy ? "Submitting…" : "I have paid"}
            </button>
            <button type="button" className="w-full py-2 text-sm text-muted-foreground" onClick={() => setStep(1)}>
              Back
            </button>
          </>
        )}
      </div>
      <Modal open={openHist} title="Deposit History" onClose={() => setOpenHist(false)}>
        <div className="space-y-2 text-sm">
          {history.length === 0 ? <p className="text-muted-foreground">No deposits yet.</p> : null}
          {history.map((d) => (
            <div key={d.id} className="rounded-xl border p-3">
              <div className="flex justify-between">
                <span>{ugx(d.amount)}</span>
                <StatusBadge status={d.status} />
              </div>
              <p className="text-xs text-muted-foreground">
                {d.payment_method} • {d.transaction_id}
              </p>
            </div>
          ))}
        </div>
      </Modal>
    </AppShell>
  );
}
