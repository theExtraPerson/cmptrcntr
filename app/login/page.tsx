"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Lock, User } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { GuestOnly } from "@/components/GuestOnly";
import { Logo } from "@/components/Logo";
import { getSupabase, usernameToEmail } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await getSupabase().auth.signInWithPassword({
      email: usernameToEmail(username),
      password,
    });
    setBusy(false);
    if (error) {
      toast.error("Invalid username or password");
      return;
    }
    router.replace("/dashboard");
  }

  return (
    <GuestOnly>
      <div className="flex min-h-screen flex-col items-center px-5 pb-10 pt-12">
        <Logo size={72} />
        <h1 className="mt-4 text-2xl font-medium">VivianFi</h1>
        <p className="text-center text-sm text-muted-foreground">Intelligent Technology. Smarter Financial Futures.</p>

        <form onSubmit={onSubmit} className="card-elevated mt-8 w-full space-y-4 p-5">
          <h2 className="text-center text-lg font-medium">Login</h2>
          <label className="block text-sm">
            Username
            <div className="relative mt-1">
              <User size={16} className="absolute left-3 top-3.5 text-muted-foreground" />
              <input
                className="input-field pl-9"
                placeholder="Enter username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
          </label>
          <label className="block text-sm">
            Password
            <div className="relative mt-1">
              <Lock size={16} className="absolute left-3 top-3.5 text-muted-foreground" />
              <input
                className="input-field pl-9 pr-10"
                type={show ? "text" : "password"}
                placeholder="••••••••"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button type="button" className="absolute right-3 top-3 text-muted-foreground" onClick={() => setShow((s) => !s)}>
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>
          <button disabled={busy} className="btn-gradient w-full rounded-xl py-3 text-sm font-medium disabled:opacity-60">
            {busy ? "Please wait…" : "Login"}
          </button>
          <p className="text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link href="/register" className="text-primary">
              Register here
            </Link>
          </p>
        </form>
        <p className="mt-8 text-xs text-muted-foreground">VIVIAN FINANCE</p>
      </div>
    </GuestOnly>
  );
}
