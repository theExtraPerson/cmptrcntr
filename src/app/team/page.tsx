"use client";

import { Copy, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { PageHeader } from "@/components/PageHeader";
import { REFERRAL_RATES } from "@/lib/platform";
import { getSupabase, ugx, type Profile } from "@/lib/supabase";

type ReferralMember = Pick<Profile, "id" | "username" | "created_at"> & {
  level: 1 | 2;
  viaUsername: string | null;
};

export default function TeamPage() {
  const { profile, settings, refresh, signOut } = useAuth();
  const router = useRouter();
  const [refs, setRefs] = useState<ReferralMember[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  const [level1Income, setLevel1Income] = useState(0);
  const [level2Income, setLevel2Income] = useState(0);
  const level1Percent = Number(settings.referral_level_1_percent || REFERRAL_RATES[0] * 100);
  const level2Percent = Number(settings.referral_level_2_percent || REFERRAL_RATES[1] * 100);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (!profile) return;
    const profileId = profile.id;
    let mounted = true;
    async function loadReferrals() {
      try {
        const supabase = getSupabase();
        const { data: directData, error: directError } = await supabase
          .from("profiles")
          .select("id,username,created_at")
          .eq("referred_by", profileId)
          .order("created_at", { ascending: false });
        if (directError) throw directError;
        const direct = (directData ?? []) as Pick<Profile, "id" | "username" | "created_at">[];
        const members: ReferralMember[] = direct.map((member) => ({
          ...member,
          level: 1,
          viaUsername: null,
        }));
        if (direct.length > 0) {
          const { data: secondData, error: secondError } = await supabase
            .from("profiles")
            .select("id,username,created_at,referred_by")
            .in("referred_by", direct.map((member) => member.id))
            .order("created_at", { ascending: false });
          if (secondError) throw secondError;
          const usernameById = new Map(direct.map((member) => [member.id, member.username]));
          for (const member of secondData ?? []) {
            members.push({
              id: member.id,
              username: member.username,
              created_at: member.created_at,
              level: 2,
              viaUsername: usernameById.get(member.referred_by) ?? null,
            });
          }
        }
        const { data: commissions, error: commissionError } = await supabase
          .from("income_history")
          .select("amount,type")
          .eq("user_id", profileId)
          .in("type", ["referral_l1", "referral_l2"]);
        if (commissionError) throw commissionError;
        const paidByLevel = (commissions ?? []).reduce(
          (totals, row) => {
            if (row.type === "referral_l1") totals.level1 += Number(row.amount);
            if (row.type === "referral_l2") totals.level2 += Number(row.amount);
            return totals;
          },
          { level1: 0, level2: 0 },
        );
        if (mounted) {
          setLevel1Income(paidByLevel.level1);
          setLevel2Income(paidByLevel.level2);
        }
        if (mounted) setRefs(members);
      } catch (error) {
        console.error("Could not load referral team", error);
        if (mounted) setLoadError("Could not load your referral team. Please try again.");
      }
    }
    void loadReferrals();
    return () => {
      mounted = false;
    };
  }, [profile]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const referralCode = (profile?.referral_code ?? "").trim().toUpperCase();
  const link = origin && referralCode
    ? `${origin}/register?ref=${encodeURIComponent(referralCode)}`
    : "";
  const directCount = refs.filter((member) => member.level === 1).length;
  const secondLevelCount = refs.filter((member) => member.level === 2).length;

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    toast.success("Copied");
  }

  return (
    <AppShell>
      <PageHeader title="Invite & Earn" subtitle={`${level1Percent}% first level · ${level2Percent}% second level`} back={false} />
      <div className="space-y-4 px-4 py-4">
        <div className="card-elevated overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/referral.jpg" alt="Computer Center referral programme: 5% first-level and 1% second-level commissions" className="w-full object-cover" />
          <div className="p-4 text-sm text-muted-foreground">
            <h3 className="font-medium text-foreground">Earn from two referral levels</h3>
            <p className="mt-1">
              Earn {level1Percent}% when someone you invite makes a successful deposit, and {level2Percent}% when a
              person invited by your referral makes a successful deposit. Commissions are credited automatically
              after each successful deposit.
            </p>
          </div>
        </div>

        <div className="combined-stats-card">
          <div>
            <p className="text-xs text-muted-foreground">First-level referrals</p>
            <p className="text-xl font-medium">{directCount}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Second-level referrals</p>
            <p className="text-xl font-medium">{secondLevelCount}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Referral Income</p>
            <p className="text-xl font-medium">{ugx(profile?.referral_income)}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="card-elevated p-3">
            <p className="text-xs text-muted-foreground">Level 1 commissions</p>
            <p className="mt-1 font-medium">{ugx(level1Income)}</p>
          </div>
          <div className="card-elevated p-3">
            <p className="text-xs text-muted-foreground">Level 2 commissions</p>
            <p className="mt-1 font-medium">{ugx(level2Income)}</p>
          </div>
        </div>

        <div className="card-elevated p-4">
          <p className="mb-2 text-sm font-medium">Referral Link</p>
          <div className="flex gap-2">
            <input className="input-field" readOnly value={link} />
            <button type="button" disabled={!link} className="gradient-mint rounded-xl px-3 text-white disabled:opacity-40" onClick={() => copy(link)}>
              <Copy size={16} />
            </button>
          </div>
        </div>
        <div className="card-elevated p-4">
          <p className="mb-2 text-sm font-medium">Referral Code</p>
          <div className="flex gap-2">
            <input className="input-field text-center tracking-widest" readOnly value={referralCode} />
            <button
              type="button"
              disabled={!referralCode}
              className="gradient-mint rounded-xl px-3 text-white disabled:opacity-40"
              onClick={() => copy(referralCode)}
            >
              <Copy size={16} />
            </button>
          </div>
        </div>

        <h2 className="text-base font-medium">My Referral Network ({refs.length})</h2>
        {loadError ? <p role="alert" className="text-sm text-destructive">{loadError}</p> : null}
        <div className="space-y-2">
          {refs.length === 0 && !loadError ? <p className="text-sm text-muted-foreground">No referrals yet.</p> : null}
          {refs.map((r) => (
            <div key={r.id} className="card-elevated flex justify-between p-3 text-sm">
              <div>
                <p>{r.username}</p>
                <p className="text-xs text-muted-foreground">
                  Level {r.level}{r.viaUsername ? ` · invited by ${r.viaUsername}` : ""}
                </p>
              </div>
              <span className="text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</span>
            </div>
          ))}
        </div>

        <button
          type="button"
          className="flex w-full items-center justify-center gap-2 rounded-xl border py-3 text-sm text-destructive"
          onClick={async () => {
            await signOut();
            router.replace("/login");
          }}
        >
          <LogOut size={16} /> Logout
        </button>
      </div>
    </AppShell>
  );
}
