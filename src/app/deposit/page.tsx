"use client";

import { History } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { Modal } from "@/components/Modal";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { api } from "@/lib/api";
import { getSupabase, ugx } from "@/lib/supabase";
import type { Payment } from "@/lib/types";

type DepositResponse = { payment: Payment; prompted: boolean; message: string };

export default function DepositPage() {
  const { profile, settings } = useAuth();
  const [amount, setAmount] = useState("");
  const [phone, setPhone] = useState(profile?.phone || "");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Payment[]>([]);
  const [openHistory, setOpenHistory] = useState(false);
  const [activePaymentId, setActivePaymentId] = useState<string | null>(null);

  useEffect(() => {
    if (profile?.phone) setPhone(profile.phone);
  }, [profile?.phone]);

  const min = Number(settings.min_deposit || 5_000);
  const max = Number(settings.max_deposit || 5_000_000);
  const value = Number(amount);
  const canSubmit =
    Number.isInteger(value) &&
    value >= min &&
    value <= max &&
    /^0\d{9}$/.test(phone);

  const loadHistory = useCallback(async (showModal = false) => {
    const { data, error } = await getSupabase()
      .from("payments")
      .select("*")
      .eq("type", "DEPOSIT")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    setHistory((data as Payment[]) ?? []);
    if (showModal) setOpenHistory(true);
  }, []);

  useEffect(() => {
    void loadHistory().catch((err) => {
      toast.error(err instanceof Error ? err.message : "Could not load deposits.");
    });
  }, [loadHistory]);

  useEffect(() => {
    if (!activePaymentId) return;
    let stopped = false;
    const check = () => {
      void api(`/api/payments/${activePaymentId}`)
        .then(({ payment }: { payment: Payment }) => {
          if (stopped) return;
          setHistory((rows) => rows.map((row) => (row.id === payment.id ? payment : row)));
          if (payment.status === "SUCCESS") {
            setActivePaymentId(null);
            toast.success("Deposit confirmed.");
          } else if (payment.status === "FAILED" || payment.status === "CANCELLED") {
            setActivePaymentId(null);
            toast.error(payment.failure_reason || "Deposit was not completed.");
          }
        })
        .catch((err: unknown) => {
          if (stopped) return;
          setActivePaymentId(null);
          toast.error(err instanceof Error ? err.message : "Could not check deposit status.");
        });
    };
    check();
    const timer = window.setInterval(check, 5_000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [activePaymentId]);

  async function submit() {
    setBusy(true);
    try {
      const result = (await api("/api/deposits", {
        method: "POST",
        body: JSON.stringify({ amount: value, phone }),
      })) as DepositResponse;
      setHistory((rows) => [result.payment, ...rows.filter((row) => row.id !== result.payment.id)]);
      setAmount("");
      setActivePaymentId(
        result.payment.status === "PENDING" || result.payment.status === "PROCESSING"
          ? result.payment.id
          : null,
      );
      if (result.prompted) toast.success(result.message);
      else toast(result.message);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start the deposit.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <PageHeader
        title="Deposit"
        right={
          <button
            type="button"
            onClick={() => void loadHistory(true).catch((err) => toast.error(err.message))}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground"
            aria-label="Deposit history"
          >
            <History size={18} />
          </button>
        }
      />
      <div className="space-y-4 px-4 py-4">
        <div className="card-elevated space-y-3 p-4">
          <label className="block text-sm">
            Amount (UGX)
            <input
              className="input-field mt-1"
              type="number"
              min={min}
              max={max}
              step="1"
              placeholder="Enter amount"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>
          <p className="text-xs text-muted-foreground">
            Min: {ugx(min)} • Max: {ugx(max)}
          </p>
          <label className="block text-sm">
            Mobile money number
            <input
              className="input-field mt-1"
              inputMode="tel"
              placeholder="0700000000"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </label>
        </div>
        <div className="card-elevated p-4 text-sm text-muted-foreground">
          We will send a mobile money approval prompt to this number. Confirm it on your phone to complete your deposit.
          Your wallet is credited only after payment confirmation. A deposit does not automatically purchase a partnership plan.
        </div>
        <button
          disabled={!canSubmit || busy}
          onClick={submit}
          className="btn-gradient w-full rounded-xl py-3 disabled:opacity-40"
        >
          {busy ? "Starting deposit…" : "Request deposit"}
        </button>
      </div>
      <Modal open={openHistory} title="Deposit History" onClose={() => setOpenHistory(false)}>
        <div className="space-y-2 text-sm">
          {history.length === 0 ? <p className="text-muted-foreground">No deposits yet.</p> : null}
          {history.map((payment) => (
            <div key={payment.id} className="space-y-1 rounded-xl border p-3">
              <div className="flex justify-between gap-2">
                <span>{ugx(payment.amount)}</span>
                <StatusBadge status={payment.status} />
              </div>
              <p className="text-xs text-muted-foreground">
                {payment.phone_number} • {new Date(payment.created_at).toLocaleString()}
              </p>
              {payment.failure_reason ? (
                <p className="text-xs text-muted-foreground">{payment.failure_reason}</p>
              ) : null}
            </div>
          ))}
        </div>
      </Modal>
    </AppShell>
  );
}
