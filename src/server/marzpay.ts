/**
 * MarzPay merchant API v1 — collections (deposits) and send-money (payouts)
 * for MTN MoMo and Airtel Money Uganda.
 *
 *   HTTP Basic auth: base64(MARZPAY_API_KEY:MARZPAY_API_SECRET)
 *   POST /collect-money        deposit; customer approves a USSD/SMS prompt
 *   POST /send-money           payout; needs IP whitelist + disbursement permission
 *   GET  /collect-money/{uuid} status poll
 *   GET  /send-money/{uuid}    status poll
 *   GET  /collect-money/services  credential handshake
 *
 * Two rules from the integration guide that shape everything here:
 *   1. HTTP 201 means "initiated", not "paid". Nothing is ever credited on the
 *      create response — only a webhook or a confirmed status poll settles.
 *   2. Every reference must be a fresh UUID v4. Reuse returns DUPLICATE_REFERENCE.
 *
 * The network is auto-detected by MarzPay from the phone number, so requests
 * carry no provider field.
 */

import { toE164 } from "@/lib/phone";

const DEFAULT_BASE_URL = "https://wallet.wearemarz.com/api/v1";
const COUNTRY = "UG";

export type MarzStatus = "PENDING" | "SUCCESSFUL" | "FAILED";
export type MarzKind = "collect" | "disburse";

export interface MarzResult {
  providerTxUuid?: string;
  providerReference?: string;
  network?: "MTN" | "AIRTEL";
  /** send-money only: the charge MarzPay takes from the merchant wallet. */
  chargeUgx?: number;
  totalDeductionUgx?: number;
  status: MarzStatus;
}

export class MarzPayError extends Error {
  code?: string;
  httpStatus: number;
  constructor(message: string, httpStatus: number, code?: string) {
    super(message);
    this.name = "MarzPayError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export function marzpayConfigured() {
  return Boolean(process.env.MARZPAY_API_KEY && process.env.MARZPAY_API_SECRET);
}

function baseUrl() {
  return process.env.MARZPAY_API_BASE ?? DEFAULT_BASE_URL;
}

export function marzpayCallbackUrl() {
  return process.env.MARZPAY_CALLBACK_URL || undefined;
}

interface MarzEnvelope {
  status?: string;
  message?: string;
  error_code?: string;
  data?: Record<string, unknown>;
}

async function marzFetch(path: string, init?: RequestInit): Promise<MarzEnvelope> {
  const credentials = Buffer.from(
    `${process.env.MARZPAY_API_KEY}:${process.env.MARZPAY_API_SECRET}`,
  ).toString("base64");

  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Authorization: `Basic ${credentials}`,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
  });

  const text = await res.text();
  let body: MarzEnvelope = {};
  try {
    body = text ? (JSON.parse(text) as MarzEnvelope) : {};
  } catch {
    // Non-JSON error body; fall through to the status-code message.
  }
  if (!res.ok || body.status === "error") {
    throw new MarzPayError(
      body.message ?? `MarzPay request failed (${res.status})`,
      res.status,
      body.error_code,
    );
  }
  return body;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

/** Money values arrive as { formatted, raw, currency }; `raw` is authoritative. */
function rawAmount(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Math.round(Number(value));
  }
  const raw = record(value).raw;
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.round(raw);
  if (typeof raw === "string" && raw.trim() && Number.isFinite(Number(raw))) {
    return Math.round(Number(raw));
  }
  return undefined;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function uniqueStrings(...values: unknown[]): string[] {
  const out: string[] = [];
  for (const value of values) {
    if (typeof value === "string" && value.trim() && !out.includes(value.trim())) {
      out.push(value.trim());
    }
  }
  return out;
}

/** "mtn" / "mtnuganda" / "airtel" -> our label. */
export function mapNetwork(value: unknown): "MTN" | "AIRTEL" | undefined {
  const v = String(value ?? "").toLowerCase();
  if (v.includes("mtn")) return "MTN";
  if (v.includes("airtel")) return "AIRTEL";
  return undefined;
}

export function mapMarzStatus(status: unknown): MarzStatus {
  const v = String(status ?? "").toLowerCase();
  if (["completed", "successful", "success", "paid", "credited"].includes(v)) return "SUCCESSFUL";
  if (["failed", "cancelled", "canceled", "rejected", "expired"].includes(v)) return "FAILED";
  return "PENDING";
}

export interface MarzSnapshot {
  status: MarzStatus;
  references: string[];
  amount?: number;
  phone?: string;
  kind?: MarzKind;
  providerTx?: string;
  description?: string;
  /** The gateway has no transaction for the reference we asked about. */
  missing?: boolean;
}

function inferKind(
  eventType: string,
  collection: Record<string, unknown>,
  disbursement: Record<string, unknown>,
): MarzKind | undefined {
  const event = eventType.toLowerCase();
  if (event.includes("collect")) return "collect";
  if (event.includes("disburse") || event.includes("send") || event.includes("payout")) {
    return "disburse";
  }
  const hasCollection = Object.keys(collection).length > 0;
  const hasDisbursement = Object.keys(disbursement).length > 0;
  if (hasCollection && !hasDisbursement) return "collect";
  if (hasDisbursement && !hasCollection) return "disburse";
  return undefined;
}

/**
 * One shape for both a status poll and a webhook. Direct callbacks start at
 * `event_type`; dashboard webhooks wrap that same body under `data`.
 */
export function readMarzSnapshot(raw: unknown): MarzSnapshot {
  const outer = record(raw);
  const body = outer.event_type ? outer : record(outer.data);
  const eventType = firstString(body.event_type, outer.event_type) ?? "";
  const transaction = record(body.transaction);
  const collection = record(body.collection);
  const disbursement = record(body.disbursement ?? body.withdrawal);
  const statusText =
    firstString(transaction.status) ??
    (eventType.includes(".") ? eventType.split(".").pop() : undefined) ??
    "";

  return {
    status: mapMarzStatus(statusText),
    references: uniqueStrings(
      transaction.reference,
      transaction.provider_reference,
      transaction.uuid,
      collection.reference,
      disbursement.reference,
      disbursement.provider_reference,
    ),
    amount: rawAmount(collection.amount ?? disbursement.amount ?? transaction.amount ?? body.amount),
    phone: firstString(
      collection.phone_number,
      collection.phone,
      disbursement.phone_number,
      disbursement.phone,
      transaction.phone_number,
      transaction.phone,
    ),
    kind: inferKind(eventType, collection, disbursement),
    providerTx: firstString(
      collection.provider_transaction_id,
      disbursement.provider_transaction_id,
      transaction.uuid,
    ),
    description: firstString(transaction.description, body.message, outer.message),
  };
}

export interface MarzCallInput {
  /** Integer whole UGX. */
  amount: number;
  /** E.164 Ugandan number, +2567XXXXXXXX. */
  phone: string;
  /** Fresh UUID v4 per transaction. */
  reference: string;
  description?: string;
  callbackUrl?: string;
}

/** POST /collect-money — the member approves a prompt on their phone. */
export async function collectMoney(input: MarzCallInput): Promise<MarzResult> {
  const body = await marzFetch("/collect-money", {
    method: "POST",
    body: JSON.stringify({
      amount: input.amount,
      phone_number: toE164(input.phone),
      reference: input.reference,
      country: COUNTRY,
      description: input.description ?? "Computer Center wallet deposit",
      ...(input.callbackUrl ? { callback_url: input.callbackUrl } : {}),
    }),
  });

  const data = record(body.data);
  const txn = record(data.transaction);
  const collection = record(data.collection);
  return {
    providerTxUuid: typeof txn.uuid === "string" ? txn.uuid : undefined,
    providerReference:
      typeof txn.provider_reference === "string" ? txn.provider_reference : undefined,
    network: mapNetwork(collection.provider),
    status: mapMarzStatus(txn.status ?? "processing"),
  };
}

/** POST /send-money — payout to the member's mobile money wallet. */
export async function sendMoney(input: MarzCallInput): Promise<MarzResult> {
  const body = await marzFetch("/send-money", {
    method: "POST",
    body: JSON.stringify({
      amount: input.amount,
      phone_number: toE164(input.phone),
      reference: input.reference,
      country: COUNTRY,
      description: input.description ?? "Computer Center withdrawal",
      ...(input.callbackUrl ? { callback_url: input.callbackUrl } : {}),
    }),
  });

  const data = record(body.data);
  const txn = record(data.transaction);
  const withdrawal = record(data.withdrawal);
  return {
    providerTxUuid: typeof txn.uuid === "string" ? txn.uuid : undefined,
    providerReference:
      typeof txn.provider_reference === "string" ? txn.provider_reference : undefined,
    network: mapNetwork(withdrawal.provider),
    chargeUgx: rawAmount(withdrawal.charge),
    totalDeductionUgx: rawAmount(withdrawal.total_deduction),
    status: mapMarzStatus(txn.status ?? "pending"),
  };
}

/** Status poll, used when a webhook is late or was delivered only once. */
export async function transactionStatus(uuid: string, kind: MarzKind): Promise<MarzSnapshot> {
  try {
    const body = await marzFetch(
      kind === "collect" ? `/collect-money/${uuid}` : `/send-money/${uuid}`,
    );
    const snapshot = readMarzSnapshot(body);
    if (!snapshot.kind) snapshot.kind = kind;
    return snapshot;
  } catch (err) {
    if (err instanceof MarzPayError && err.httpStatus === 404) {
      // A missing record is not proof the member never paid.
      return { status: "PENDING", references: uuid ? [uuid] : [], missing: true, kind };
    }
    // A transient error must never finalize a payment.
    return { status: "PENDING", references: [], kind };
  }
}

export function marzpayConfigPresence() {
  return {
    baseUrl: baseUrl(),
    apiKey: Boolean(process.env.MARZPAY_API_KEY),
    apiSecret: Boolean(process.env.MARZPAY_API_SECRET),
    callbackUrl: marzpayCallbackUrl() ?? null,
    country: COUNTRY,
    currency: "UGX",
  };
}

/** Credential handshake that needs no IP whitelist. */
export async function marzpayAuthCheck() {
  if (!marzpayConfigured()) return { ok: false, reason: "MarzPay credentials are not configured." };
  try {
    await marzFetch("/collect-money/services");
    return { ok: true as const };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "Services request failed." };
  }
}
