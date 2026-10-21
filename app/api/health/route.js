import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Controllo di messa in funzione: dice SOLO se le variabili ci sono, mai il loro valore.
export async function GET(req) {
  const v = n => !!process.env[n];
  const ok = { ANTHROPIC_API_KEY: v("ANTHROPIC_API_KEY"), GITHUB_CLIENT_ID: v("GITHUB_CLIENT_ID"), GITHUB_CLIENT_SECRET: v("GITHUB_CLIENT_SECRET"), SESSION_SECRET: v("SESSION_SECRET") && process.env.SESSION_SECRET.length >= 16, STUDIO_CODE: v("STUDIO_CODE") };
  let claude;
  if (new URL(req.url).searchParams.get("claude") === "1") {
    try {
      const r = await fetch((process.env.ANTHROPIC_API_URL || "https://api.anthropic.com") + "/v1/messages", {
        method: "POST",
        headers: { "x-api-key": process.env.ANTHROPIC_API_KEY || "", "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: process.env.STUDIO_MODEL || "claude-sonnet-5", max_tokens: 5, messages: [{ role: "user", content: "ciao" }] }),
      });
      claude = r.ok ? "ok" : "errore " + r.status + (r.status === 401 ? " (chiave non valida)" : r.status === 404 ? " (modello non trovato: imposta STUDIO_MODEL)" : "");
    } catch { claude = "irraggiungibile"; }
  }
  return NextResponse.json({ ...(claude ? { claude } : {}), pronto: Object.values(ok).every(Boolean), variabili: ok, modello: process.env.STUDIO_MODEL || "claude-sonnet-5 (predefinito)", utentiAmmessi: (process.env.STUDIO_ALLOWED_USERS || "").trim() ? "elenco" : "chiunque abbia il codice" });
}
