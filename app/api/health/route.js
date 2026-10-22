import { NextResponse } from "next/server";
import { configurato } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Controllo di messa in funzione: dice SOLO se le variabili ci sono, mai il loro valore.
export async function GET() {
  const v = n => !!process.env[n];
  const ok = { ANTHROPIC_API_KEY: v("ANTHROPIC_API_KEY"), GITHUB_CLIENT_ID: v("GITHUB_CLIENT_ID"), GITHUB_CLIENT_SECRET: v("GITHUB_CLIENT_SECRET"), SESSION_SECRET: v("SESSION_SECRET") && process.env.SESSION_SECRET.length >= 16, STUDIO_CODE: v("STUDIO_CODE") };
  return NextResponse.json({ pronto: Object.values(ok).every(Boolean), variabili: ok, collegamentoSupabase: configurato() ? "attivo" : "non configurato (facoltativo)", modello: process.env.STUDIO_MODEL || "claude-sonnet-5 (predefinito)", utentiAmmessi: (process.env.STUDIO_ALLOWED_USERS || "").trim() ? "elenco" : "chiunque abbia il codice" });
}
