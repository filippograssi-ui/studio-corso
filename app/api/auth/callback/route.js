import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { leggiSessione, scriviSessione, utenteAmmesso } from "@/lib/session";
import { gh } from "@/lib/github";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const u = new URL(req.url);
  const origine = process.env.STUDIO_URL || u.origin;
  const jar = await cookies();
  const state = jar.get("studio_state")?.value;
  jar.delete("studio_state");
  const s = await leggiSessione();
  if (!s?.ok || !state || state !== u.searchParams.get("state") || !u.searchParams.get("code")) {
    return NextResponse.redirect(origine + "/?errore=accesso");
  }
  const r = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: process.env.GITHUB_CLIENT_ID, client_secret: process.env.GITHUB_CLIENT_SECRET, code: u.searchParams.get("code"), redirect_uri: origine + "/api/auth/callback" }),
  });
  const dati = await r.json().catch(() => ({}));
  if (!dati.access_token) return NextResponse.redirect(origine + "/?errore=accesso");
  const utente = await gh(dati.access_token, "/user");
  if (!utenteAmmesso(utente.login)) return NextResponse.redirect(origine + "/?errore=non-ammesso");
  await scriviSessione({ ok: true, token: dati.access_token, login: utente.login });
  return NextResponse.redirect(origine + "/");
}
