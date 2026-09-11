"use client";

import { useEffect, useState } from "react";
import { useAuth } from "./AuthProvider";

export function WelcomePopup() {
  const { settings } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (settings.welcome_popup_enabled !== "true") return;
    if (sessionStorage.getItem("pn_welcome")) return;
    setOpen(true);
  }, [settings.welcome_popup_enabled]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-6">
      <div className="card-elevated w-full max-w-sm p-5">
        <h2 className="mb-2 text-lg font-medium">Welcome</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          {settings.welcome_popup_message || "Welcome to VivianFi."}
        </p>
        <button
          className="btn-gradient w-full rounded-xl py-3 text-sm font-medium"
          type="button"
          onClick={() => {
            sessionStorage.setItem("pn_welcome", "1");
            setOpen(false);
          }}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
