import { NextResponse } from "next/server";
import { adminClient, jsonError } from "@/lib/server";
import { makeReferralCode, usernameToEmail } from "@/lib/supabase";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (!body || typeof body !== "object" || Array.isArray(body)) return jsonError("Invalid registration data", 400);
  const username = String(body.username || "").trim();
  const phone = String(body.phone || "").trim();
  const password = String(body.password || "");
  const referral = String(body.referral || "").trim().toUpperCase();

  if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) {
    return jsonError("Username must be 3-24 letters, numbers, or underscore");
  }
  if (!/^0\d{9}$/.test(phone)) {
    return jsonError("Enter a valid phone number like 0700000000");
  }
  if (password.length < 6) {
    return jsonError("Password must be at least 6 characters");
  }

  const admin = adminClient();
  const email = usernameToEmail(username);

  const { data: existing, error: existingErr } = await admin
    .from("profiles")
    .select("id")
    .ilike("username", username)
    .maybeSingle();
  if (existingErr) return jsonError(existingErr.message, 500);
  if (existing) return jsonError("Username already taken");

  let referredBy: string | null = null;
  if (referral) {
    if (!/^[A-Z0-9]{8}$/.test(referral)) return jsonError("Invalid referral code", 400);
    const { data: ref, error: refErr } = await admin
      .from("profiles")
      .select("id")
      .eq("referral_code", referral)
      .maybeSingle();
    if (refErr) return jsonError(refErr.message, 500);
    if (!ref) return jsonError("Invalid referral code");
    referredBy = ref.id;
  }

  let code: string | null = null;
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = makeReferralCode().toUpperCase();
    const { data: clash, error: clashErr } = await admin
      .from("profiles")
      .select("id")
      .eq("referral_code", candidate)
      .maybeSingle();
    if (clashErr) return jsonError(clashErr.message, 500);
    if (!clash) {
      code = candidate;
      break;
    }
  }
  if (!code) return jsonError("Could not create a unique referral code. Please try again.", 503);

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username, phone },
  });
  if (createErr || !created.user) {
    return jsonError(createErr?.message || "Could not create account");
  }

  const { error: profileErr } = await admin.from("profiles").insert({
    id: created.user.id,
    username,
    phone,
    referral_code: code,
    referred_by: referredBy,
  });
  if (profileErr) {
    await admin.auth.admin.deleteUser(created.user.id);
    return jsonError(profileErr.message || "Could not create profile");
  }

  return NextResponse.json({ ok: true });
}
