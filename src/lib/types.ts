export const PAYMENT_REVIEW_PREFIX = "[payment-review]";

export type PaymentType = "DEPOSIT" | "WITHDRAWAL";
export type PaymentMode = "MARZPAY" | "MANUAL";
export type PaymentStatus = "PENDING" | "PROCESSING" | "SUCCESS" | "FAILED" | "CANCELLED";

export type Payment = {
  id: string;
  user_id: string;
  type: PaymentType;
  mode: PaymentMode;
  status: PaymentStatus;
  provider: "MTN" | "AIRTEL" | null;
  amount: number;
  fee: number;
  net_amount: number;
  phone_number: string;
  external_reference: string;
  provider_tx_uuid: string | null;
  provider_reference: string | null;
  failure_reason: string | null;
  admin_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};
