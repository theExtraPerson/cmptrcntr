import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function usernameToEmail(username: string) {
  return `${username.toLowerCase().replace(/\s+/g, "")}@vivianfi.app`;
}

export function ugx(amount: number | string | null | undefined) {
  const n = Number(amount || 0);
  return `UGX ${n.toLocaleString()}`;
}

let browserClient: SupabaseClient | null = null;

export function getSupabase() {
  if (browserClient) return browserClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  browserClient = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, storage: typeof window === "undefined" ? undefined : localStorage },
  });
  return browserClient;
}

export type Profile = {
  id: string;
  username: string;
  phone: string;
  referral_code: string;
  referred_by: string | null;
  balance: number;
  total_deposits: number;
  total_income: number;
  total_withdrawals: number;
  referral_income: number;
  is_banned: boolean;
  created_at: string;
};

export type Product = {
  id: string;
  name: string | null;
  price: number;
  daily_income: number;
  validity_days: number;
  thumbnail_url: string | null;
  is_active: boolean;
};

export type Investment = {
  id: string;
  user_id: string;
  product_id: string | null;
  amount: number;
  daily_income: number;
  payouts_claimed: number;
  days_remaining: number;
  next_payout_at: string;
  last_claimed_at: string | null;
  is_active: boolean;
  capital_returned: boolean;
  created_at: string;
};

export type Story = {
  id: string;
  title: string;
  description: string;
  image_url: string | null;
  is_published: boolean;
  created_at: string;
  updated_at: string;
};

export type Deposit = {
  id: string;
  user_id: string;
  amount: number;
  payment_method: string;
  transaction_id: string;
  sender_name: string | null;
  sender_phone: string | null;
  status: "pending" | "approved" | "rejected";
  approved_at: string | null;
  created_at: string;
};

export type Withdrawal = {
  id: string;
  user_id: string;
  amount: number;
  fee: number;
  net_amount: number;
  phone: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
};

export type IncomeRow = {
  id: string;
  user_id: string;
  amount: number;
  type: string;
  source_id: string | null;
  created_at: string;
};

export function makeReferralCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}
