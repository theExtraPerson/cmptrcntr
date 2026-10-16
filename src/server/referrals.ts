import type { SupabaseClient } from "@supabase/supabase-js";
import { REFERRAL_RATES } from "@/lib/platform";

const LEVEL1_RATE = REFERRAL_RATES[0];
const LEVEL2_RATE = REFERRAL_RATES[1];

type ProfileRow = {
  id: string;
  username: string | null;
  full_name: string | null;
  referral_code: string | null;
  referred_by: string | null;
  created_at: string;
};

type ReferralRow = {
  referrer_id: string;
  referee_id: string;
  referral_code: string | null;
};

type OrderRow = {
  user_id: string;
  price: number;
};

type CommissionRow = {
  user_id: string;
  source_user_id: string | null;
  referral_level: number | null;
  amount: number;
};

export type ReferralSnapshotRow = {
  refereeId: string;
  refereeName: string | null;
  refereeUsername: string | null;
  code: string | null;
  referrerId: string;
  referrerName: string | null;
  referrerUsername: string | null;
  invested: number;
  rate: number;
  commission: number;
  uplineId: string | null;
  uplineName: string | null;
  uplineUsername: string | null;
  uplineRate: number;
  uplineCommission: number;
  status: "invested" | "waiting";
  joinedAt: string;
};

export type ReferralSnapshot = {
  links: number;
  investedMembers: number;
  waitingMembers: number;
  investedVolume: number;
  commissionPaid: number;
  level1Rate: number;
  level2Rate: number;
  rows: ReferralSnapshotRow[];
};

export type UserReferralLine = {
  id: string;
  username: string | null;
  full_name: string | null;
  referral_code: string | null;
  created_at: string;
  level: 1 | 2;
  rate: number;
  invested: number;
  commission: number;
  via_username: string | null;
  status: "invested" | "waiting";
};

async function fetchAll<T>(
  run: PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const { data, error } = await run;
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Every invite, the code that created it, and the commission each level was paid. */
export async function loadReferralSnapshot(admin: SupabaseClient): Promise<ReferralSnapshot> {
  const [profiles, links, orders, commissions] = await Promise.all([
    fetchAll<ProfileRow>(
      admin
        .from("profiles")
        .select("id, username, full_name, referral_code, referred_by, created_at")
        .limit(5000),
    ),
    fetchAll<ReferralRow>(
      admin.from("referrals").select("referrer_id, referee_id, referral_code").limit(5000),
    ),
    fetchAll<OrderRow>(
      admin
        .from("orders")
        .select("user_id, price")
        .eq("product_category", "plant")
        .in("status", ["active", "completed"])
        .limit(5000),
    ),
    fetchAll<CommissionRow>(
      admin
        .from("ledger_entries")
        .select("user_id, source_user_id, referral_level, amount")
        .eq("type", "commission")
        .limit(5000),
    ),
  ]);

  const profileOf = new Map(profiles.map((p) => [p.id, p]));
  const investedOf = new Map<string, number>();
  for (const order of orders) {
    investedOf.set(order.user_id, (investedOf.get(order.user_id) ?? 0) + Number(order.price));
  }

  const paid = new Map<string, number>();
  for (const row of commissions) {
    if (!row.source_user_id || row.referral_level == null) continue;
    const key = `${row.user_id}:${row.source_user_id}:${row.referral_level}`;
    paid.set(key, (paid.get(key) ?? 0) + Number(row.amount));
  }

  const edgeOf = new Map<string, { referrerId: string; code: string | null }>();
  for (const profile of profiles) {
    if (!profile.referred_by || profile.referred_by === profile.id) continue;
    const referrer = profileOf.get(profile.referred_by);
    edgeOf.set(profile.id, {
      referrerId: profile.referred_by,
      code: referrer?.referral_code ?? null,
    });
  }
  for (const link of links) {
    if (!link.referrer_id || link.referrer_id === link.referee_id) continue;
    const referrer = profileOf.get(link.referrer_id);
    const stored = (link.referral_code ?? "").trim();
    edgeOf.set(link.referee_id, {
      referrerId: link.referrer_id,
      code: stored || referrer?.referral_code || edgeOf.get(link.referee_id)?.code || null,
    });
  }

  const rows: ReferralSnapshotRow[] = [];
  for (const [refereeId, edge] of edgeOf) {
    const referee = profileOf.get(refereeId);
    const referrer = profileOf.get(edge.referrerId);
    if (!referee || !referrer) continue;

    const invested = investedOf.get(refereeId) ?? 0;
    const uplineEdge = edgeOf.get(referrer.id);
    const uplineId =
      uplineEdge && uplineEdge.referrerId !== refereeId ? uplineEdge.referrerId : null;
    const upline = uplineId ? profileOf.get(uplineId) ?? null : null;
    const commission = paid.get(`${referrer.id}:${refereeId}:1`) ?? 0;
    const uplineCommission = upline ? paid.get(`${upline.id}:${refereeId}:2`) ?? 0 : 0;

    rows.push({
      refereeId,
      refereeName: referee.full_name,
      refereeUsername: referee.username,
      code: edge.code,
      referrerId: referrer.id,
      referrerName: referrer.full_name,
      referrerUsername: referrer.username,
      invested,
      rate: LEVEL1_RATE,
      commission,
      uplineId: upline?.id ?? null,
      uplineName: upline?.full_name ?? null,
      uplineUsername: upline?.username ?? null,
      uplineRate: LEVEL2_RATE,
      uplineCommission,
      status: invested > 0 ? "invested" : "waiting",
      joinedAt: referee.created_at,
    });
  }

  rows.sort((a, b) => b.invested - a.invested || b.commission - a.commission || b.joinedAt.localeCompare(a.joinedAt));

  const investedMembers = rows.filter((row) => row.status === "invested").length;
  return {
    links: rows.length,
    investedMembers,
    waitingMembers: rows.length - investedMembers,
    investedVolume: rows.reduce((sum, row) => sum + row.invested, 0),
    commissionPaid: rows.reduce((sum, row) => sum + row.commission + row.uplineCommission, 0),
    level1Rate: LEVEL1_RATE,
    level2Rate: LEVEL2_RATE,
    rows,
  };
}

/** Level 1 and level 2 lines that pay this member, using the same snapshot. */
export function referralLinesForUser(snapshot: ReferralSnapshot, userId: string): UserReferralLine[] {
  const lines: UserReferralLine[] = [];

  for (const row of snapshot.rows) {
    if (row.referrerId === userId) {
      lines.push({
        id: row.refereeId,
        username: row.refereeUsername,
        full_name: row.refereeName,
        referral_code: row.code,
        created_at: row.joinedAt,
        level: 1,
        rate: row.rate,
        invested: row.invested,
        commission: row.commission,
        via_username: null,
        status: row.status,
      });
    } else if (row.uplineId === userId) {
      lines.push({
        id: row.refereeId,
        username: row.refereeUsername,
        full_name: row.refereeName,
        referral_code: row.code,
        created_at: row.joinedAt,
        level: 2,
        rate: row.uplineRate,
        invested: row.invested,
        commission: row.uplineCommission,
        via_username: row.referrerUsername,
        status: row.status,
      });
    }
  }

  lines.sort((a, b) => a.level - b.level || b.commission - a.commission || b.invested - a.invested);
  return lines;
}
