"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BottomNav } from "./BottomNav";
import { useAuth } from "./AuthProvider";
import { WelcomePopup } from "./WelcomePopup";
import DashboardLoading from "@/app/dashboard/loading";

export function AppShell({ children, admin }: { children: React.ReactNode; admin?: boolean }) {
  const { user, profile, loading, isAdmin } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else if (admin && !isAdmin) router.replace("/dashboard");
  }, [user, loading, isAdmin, admin, router]);

  if (loading || !user || !profile) {
    if (pathname === "/dashboard") return <DashboardLoading />;
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
