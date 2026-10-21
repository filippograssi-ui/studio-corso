import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { leggiSessione } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const origine = process.env.STUDIO_URL || new URL(req.url).origin;
  const s = await leggiSessione();
  if (!s?.ok) return NextResponse.redirect(origine + "/");
  if (!process.env.GITHUB_CLIENT_ID) return NextResponse.json({ errore: "Manca GITHUB_CLIENT_ID su Vercel." }, { status: 500 });
  const state = crypto.randomBytes(16).toString("hex");
  const jar = await cookies();
  jar.set("studio_state", state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 600 });
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", process.env.GITHUB_CLIENT_ID);
  url.searchParams.set("redirect_uri", origine + "/api/auth/callback");
  url.searchParams.set("scope", "repo");
  url.searchParams.set("state", state);
  return NextResponse.redirect(url.toString());
}
