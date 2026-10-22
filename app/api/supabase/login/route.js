import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { leggiSessione } from "@/lib/session";
import { API, configurato, pkce } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const origine = process.env.STUDIO_URL || new URL(req.url).origin;
  const s = await leggiSessione();
  if (!s?.login) return NextResponse.redirect(origine + "/");
  if (!configurato()) return NextResponse.json({ errore: "Il collegamento a Supabase non è attivo su Studio." }, { status: 500 });
  const state = crypto.randomBytes(16).toString("hex");
  const { verifier, challenge } = pkce();
  const jar = await cookies();
  const opz = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 600 };
  jar.set("studio_sb_state", state, opz);
  jar.set("studio_sb_ver", verifier, opz);
  const url = new URL(API() + "/v1/oauth/authorize");
  url.searchParams.set("client_id", process.env.SUPABASE_CLIENT_ID);
  url.searchParams.set("redirect_uri", origine + "/api/supabase/callback");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return NextResponse.redirect(url.toString());
}
