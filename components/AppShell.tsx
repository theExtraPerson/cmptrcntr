"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { BottomNav } from "./BottomNav";
import { useAuth } from "./AuthProvider";
import { WelcomePopup } from "./WelcomePopup";

export function AppShell({ children, admin }: { children: React.ReactNode; admin?: boolean }) {
  const { user, profile, loading, isAdmin } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else if (admin && !isAdmin) router.replace("/dashboard");
  }, [user, loading, isAdmin, admin, router]);

  if (loading || !user || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading…</div>
    );
  }
  if (admin && !isAdmin) return null;

  return (
    <div className="min-h-screen pb-24">
      {children}
      {!admin ? <BottomNav /> : null}
      {!admin ? <WelcomePopup /> : null}
    </div>
  );
}
