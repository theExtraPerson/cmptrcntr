import { NextResponse } from "next/server";
import { adminClient, getUserFromRequest, jsonError } from "@/lib/server";

export async function POST(req: Request) {
  const { user, error } = await getUserFromRequest(req);
  if (!user) return jsonError(error || "Unauthorized", 401);

  const body = await req.json().catch(() => ({}));
  const password = String(body.password || "");
  if (password.length < 6) return jsonError("Password must be at least 6 characters");

  const admin = adminClient();
  const { error: updErr } = await admin.auth.admin.updateUserById(user.id, { password });
  if (updErr) return jsonError(updErr.message);

  return NextResponse.json({ ok: true });
}
