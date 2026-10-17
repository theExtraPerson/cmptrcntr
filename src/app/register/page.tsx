"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Lock, Phone, User } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { toast } from "sonner";
import { GuestOnly } from "@/components/GuestOnly";
import { Logo } from "@/components/Logo";
import { getSupabase, usernameToEmail } from "@/lib/supabase";

function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const referralParam = (params.get("ref") ?? "").trim().toUpperCase();
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [referral, setReferral] = useState(referralParam);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (referralParam) setReferral(referralParam);
  }, [referralParam]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, phone, password, referral }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not register");
      const { error } = await getSupabase().auth.signInWithPassword({
        email: usernameToEmail(username),
        password,
      });
      if (error) throw error;
      router.replace("/dashboard");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not register");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card-elevated mt-8 w-full space-y-4 p-5">
      <h2 className="text-center text-lg font-medium">Create Account</h2>
      <label className="block text-sm">
        Username
        <div className="relative mt-1">
          <User size={16} className="absolute left-4 top-3.5 text-muted-foreground" />
          <input className="input-field py-3.5 pl-12" placeholder="Enter username" required value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>
      </label>
      <label className="block text-sm">
        Phone Number
        <div className="relative mt-1">
          <Phone size={16} className="absolute left-4 top-3.5 text-muted-foreground" />
          <input className="input-field py-3.5 pl-12" placeholder="0700000000" required value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
      </label>
      <label className="block text-sm">
        Password
        <div className="relative mt-1">
          <Lock size={16} className="absolute left-4 top-3.5 text-muted-foreground" />
          <input
            className="input-field py-3.5 pl-12 pr-12"
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
      <label className="block text-sm">
        Referral Code (optional)
        <input
          className="input-field mt-1 py-3.5 uppercase"
          placeholder="Enter referral code"
          autoComplete="off"
          value={referral}
          onChange={(e) => setReferral(e.target.value.toUpperCase())}
        />
      </label>
      <button disabled={busy} className="btn-gradient w-full rounded-xl py-3 text-sm font-medium disabled:opacity-60">
        {busy ? "Please wait…" : "Create Account"}
      </button>
      <p className="text-center text-xs text-muted-foreground">
        After registration, the minimum partnership deposit is UGX 5,000. Review plan terms and risks before participating.
      </p>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="text-primary">
          Login here
        </Link>
      </p>
    </form>
  );
}

export default function RegisterPage() {
  return (
    <GuestOnly>
      <div className="flex min-h-screen flex-col items-center px-5 pb-10 pt-12">
        <Logo size={72} />
        <h1 className="mt-4 text-2xl font-medium">Computer Center</h1>
        <p className="text-center text-sm text-muted-foreground">Connecting People With Technology.</p>
        <Suspense fallback={<div className="mt-8 text-sm text-muted-foreground">Loading…</div>}>
          <RegisterForm />
        </Suspense>
        <p className="mt-8 text-xs text-muted-foreground">COMPUTER CENTER</p>
      </div>
    </GuestOnly>
  );
}
