import { NextResponse } from "next/server";
import { adminClient, jsonError, requireAdmin } from "@/lib/server";

export async function POST(req: Request) {
  const { user, error } = await requireAdmin(req);
  if (!user) return jsonError(error || "Forbidden", error === "Unauthorized" ? 401 : 403);
  const body = await req.json().catch(() => ({}));
  const title = String(body.title || "").trim();
  if (!title) return jsonError("Title is required");
  const admin = adminClient();
  const { data, error: insErr } = await admin
    .from("success_stories")
    .insert({
      title,
      description: String(body.description || ""),
      image_url: body.image_url || null,
      is_published: body.is_published !== false,
    })
    .select("*")
    .single();
  if (insErr) return jsonError(insErr.message);
  return NextResponse.json({ ok: true, story: data });
}
