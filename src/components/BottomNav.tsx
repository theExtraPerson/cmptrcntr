"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Download, Home, ShoppingBag, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function BottomNav() {
  const path = usePathname();
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const handleAppInstalled = () => setInstallPrompt(null);
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  async function installApp() {
    if (!installPrompt) {
      toast("Use your browser menu and choose 'Install Computer Center' or 'Add to Home screen'.");
      return;
    }
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }

  return (
    <nav className="bottom-nav mx-auto max-w-md">
      <div className="grid grid-cols-4">
        <Link href="/dashboard" className={`bottom-nav-item ${path === "/dashboard" ? "active" : ""}`}>
          <Home size={22} />
          <span className="text-xs font-medium">Dashboard</span>
        </Link>
        <Link href="/products" className={`bottom-nav-item ${path.startsWith("/products") ? "active" : ""}`}>
          <ShoppingBag size={22} />
          <span className="text-xs font-medium">Plans</span>
        </Link>
        <Link href="/team" className={`bottom-nav-item ${path.startsWith("/team") ? "active" : ""}`}>
          <Users size={22} />
          <span className="text-xs font-medium">My Team</span>
        </Link>
        <button type="button" onClick={() => void installApp()} className="bottom-nav-item">
          <Download size={22} />
          <span className="text-xs font-medium">Download</span>
        </button>
      </div>
    </nav>
  );
}
