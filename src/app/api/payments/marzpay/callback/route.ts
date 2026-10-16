import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { jsonError } from "@/lib/server";
import type { Payment } from "@/lib/types";
import { marzpayConfigured, readMarzSnapshot, transactionStatus } from "@/server/marzpay";
import { applyGatewayVerdict, findPaymentByReference } from "@/server/payments";

export async function POST(req: Request) {
  if (!marzpayConfigured()) return jsonError("MarzPay is not configured.", 503);
  const raw = await req.json().catch(() => null);
  if (!raw) return jsonError("Invalid callback payload.");
  const callback = readMarzSnapshot(raw);
  const references = [...callback.references, ...(callback.providerTx ? [callback.providerTx] : [])];
  if (references.length === 0) return jsonError("Callback did not include a transaction reference.");

  const admin = createAdminClient();
  let payment: Payment | null = null;
  try {
    for (const reference of references) {
      payment = await findPaymentByReference(admin, reference);
      if (payment) break;
    }
    if (!payment) return NextResponse.json({ ok: true, ignored: true }, { status: 202 });
    if (payment.mode !== "MARZPAY") {
      return NextResponse.json({ ok: true, ignored: true }, { status: 202 });
    }

    // Treat the callback only as a lookup hint. Fetch the transaction from
    // MarzPay before applying any state change because callbacks are unsigned.
    const uuid = payment.provider_tx_uuid ?? payment.external_reference;
    const verdict = await transactionStatus(
      uuid,
      payment.type === "DEPOSIT" ? "collect" : "disburse",
    );
    await applyGatewayVerdict(admin, payment, verdict);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Could not process MarzPay callback.", 500);
  }
}
