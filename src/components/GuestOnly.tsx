"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "./AuthProvider";

export function GuestOnly({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [user, loading, router]);
  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  }
  if (user) return null;
  return <>{children}</>;
}
