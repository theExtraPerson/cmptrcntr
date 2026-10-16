"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Session, SupabaseClient, User } from "@supabase/supabase-js";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { getSupabase, type Profile } from "@/lib/supabase";

type AuthCtx = {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  settings: Record<string, string>;
  isAdmin: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (userId?: string) => {
    const supabase = getSupabase();
    const id = userId ?? (await supabase.auth.getUser()).data.user?.id;
    if (!id) {
      setProfile(null);
      setIsAdmin(false);
      return;
    }
    const [{ data: p }, { data: role }, { data: settingRows }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", id).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", id).eq("role", "admin").maybeSingle(),
      supabase.from("platform_settings").select("key,value"),
    ]);
    const map: Record<string, string> = {};
    for (const row of settingRows ?? []) map[row.key] = row.value;
    setSettings(map);
    if (p?.is_banned) {
      toast.error("Your account has been banned");
      await supabase.auth.signOut();
      setProfile(null);
      setIsAdmin(false);
      return;
    }
    setProfile(p as Profile | null);
    setIsAdmin(Boolean(role));
    const ts = map.force_refresh_timestamp || "0";
    if (typeof window !== "undefined" && ts !== "0") {
      const seen = localStorage.getItem("pn_force_refresh");
      if (seen !== ts) {
        localStorage.setItem("pn_force_refresh", ts);
        toast("Please refresh your account");
      }
    }
  }, []);

  useEffect(() => {
    let supabase: SupabaseClient;
    try {
      supabase = getSupabase();
    } catch (err) {
      console.error(err);
      setLoading(false);
      return;
    }
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      load(data.session?.user.id).finally(() => setLoading(false));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, sess) => {
      setSession(sess);
      load(sess?.user.id);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [load]);

  const refresh = useCallback(async () => {
    if (session?.user.id) {
      try {
        await api("/api/investments/process", { method: "POST" });
      } catch (err) {
        console.error("Could not prepare completed partnership plans for payout review", err);
      }
    }
    await load(session?.user.id);
  }, [load, session?.user.id]);

  const signOut = useCallback(async () => {
    await getSupabase().auth.signOut();
    setProfile(null);
    setIsAdmin(false);
  }, []);

  const value = useMemo(
    () => ({
      user: session?.user ?? null,
      session,
      profile,
      settings,
      isAdmin,
      loading,
      refresh,
      signOut,
    }),
    [session, profile, settings, isAdmin, loading, refresh, signOut],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
