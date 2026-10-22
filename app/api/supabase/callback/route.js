import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { leggiSessione, sigilla } from "@/lib/session";
import { scambiaCodice } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const u = new URL(req.url);
  const origine = process.env.STUDIO_URL || u.origin;
  const jar = await cookies();
  const state = jar.get("studio_sb_state")?.value;
  const verifier = jar.get("studio_sb_ver")?.value;
  jar.delete("studio_sb_state");
  jar.delete("studio_sb_ver");
  const s = await leggiSessione();
  if (!s?.login || !state || !verifier || state !== u.searchParams.get("state") || !u.searchParams.get("code")) {
    return NextResponse.redirect(origine + "/?errore=supabase");
  }
  const token = await scambiaCodice(u.searchParams.get("code"), verifier, origine + "/api/supabase/callback").catch(() => null);
  if (!token) return NextResponse.redirect(origine + "/?errore=supabase");
  // cookie a parte (solo il token di accesso, dura un'ora): non gonfia il cookie di sessione
  jar.set("studio_sb", sigilla({ t: token }), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 3600 });
  return NextResponse.redirect(origine + "/?db=1");
}
