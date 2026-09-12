"use client";

import { Copy, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { PageHeader } from "@/components/PageHeader";
import { getSupabase, ugx, type Profile } from "@/lib/supabase";

export default function TeamPage() {
  const { profile, settings, refresh, signOut } = useAuth();
  const router = useRouter();
  const [refs, setRefs] = useState<Pick<Profile, "id" | "username" | "created_at">[]>([]);
  const pct = settings.referral_percent || "5";

  useEffect(() => {
    if (!profile) return;
    getSupabase()
      .from("profiles")
      .select("id,username,created_at")
      .eq("referred_by", profile.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => setRefs((data as Pick<Profile, "id" | "username" | "created_at">[]) ?? []));
  }, [profile]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const link = `${origin}/register?ref=${profile?.referral_code || ""}`;

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    toast.success("Copied");
  }

  return (
    <AppShell>
      <PageHeader title="My Team" subtitle={`Direct Affiliate Bonus ${pct}%`} back={false} />
      <div className="space-y-4 px-4 py-4">
        <div className="card-elevated overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/direct_affliate_bonus.jpg" alt="Direct Affiliate Bonus" className="w-full object-cover" />
          <div className="p-4 text-sm text-muted-foreground">
            <h3 className="font-medium text-foreground">Direct Affiliate Bonus</h3>
            <p className="mt-1">
              Level 1 pays {pct}%. Invite friends to activate a Vivian Quantitative Robot with a minimum trade of UGX
              5,000. After they activate, you receive an instant bonus every time they make a qualifying deposit.
            </p>
          </div>
        </div>

        <div className="combined-stats-card">
          <div>
            <p className="text-xs text-muted-foreground">Total Referrals</p>
            <p className="text-xl font-medium">{refs.length}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Referral Income</p>
            <p className="text-xl font-medium">{ugx(profile?.referral_income)}</p>
          </div>
        </div>

        <div className="card-elevated p-4">
          <p className="mb-2 text-sm font-medium">Referral Link</p>
          <div className="flex gap-2">
            <input className="input-field" readOnly value={link} />
            <button type="button" className="gradient-mint rounded-xl px-3 text-white" onClick={() => copy(link)}>
              <Copy size={16} />
            </button>
          </div>
        </div>
        <div className="card-elevated p-4">
          <p className="mb-2 text-sm font-medium">Referral Code</p>
          <div className="flex gap-2">
            <input className="input-field text-center tracking-widest" readOnly value={profile?.referral_code || ""} />
            <button
              type="button"
              className="gradient-mint rounded-xl px-3 text-white"
              onClick={() => copy(profile?.referral_code || "")}
            >
              <Copy size={16} />
            </button>
          </div>
        </div>

        <h2 className="text-base font-medium">My Referrals ( {refs.length} )</h2>
        <div className="space-y-2">
          {refs.length === 0 ? <p className="text-sm text-muted-foreground">No referrals yet.</p> : null}
          {refs.map((r) => (
            <div key={r.id} className="card-elevated flex justify-between p-3 text-sm">
              <span>{r.username}</span>
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
