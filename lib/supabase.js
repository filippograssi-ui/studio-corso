// Collegamento a Supabase tramite OAuth: Studio crea il database del partecipante,
// la tabella "stato" e restituisce le due variabili da incollare su Vercel.
// Le chiavi non vengono mai scritte nel repository né nei log.
import crypto from "node:crypto";

export const API = () => process.env.SUPABASE_API || "https://api.supabase.com";

export function configurato() {
  return Boolean(process.env.SUPABASE_CLIENT_ID && process.env.SUPABASE_CLIENT_SECRET);
}

// Stessa tabella del modello del corso (supabase/migrazione.sql). Idempotente.
export const SQL_TABELLA = `create table if not exists stato (
  user_id text primary key,
  dati jsonb not null,
  aggiornato_il timestamptz not null default now()
);
alter table stato enable row level security;`;

export function pkce() {
  const verifier = crypto.randomBytes(48).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

function messaggio(dati) {
  if (!dati) return "";
  if (typeof dati === "string") return dati.slice(0, 300);
  return String(dati.message || dati.error_description || dati.error || JSON.stringify(dati)).slice(0, 300);
}

async function chiama(token, metodo, percorso, corpo) {
  const r = await fetch(API() + percorso, {
    method: metodo,
    headers: { Authorization: "Bearer " + token, Accept: "application/json", ...(corpo ? { "Content-Type": "application/json" } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const testo = await r.text();
  let dati; try { dati = JSON.parse(testo); } catch { dati = testo; }
  if (!r.ok) {
    const e = new Error(messaggio(dati) || "Supabase ha risposto " + r.status);
    e.status = r.status;
    throw e;
  }
  return dati;
}

export async function scambiaCodice(code, verifier, redirectUri) {
  const base = Buffer.from(`${process.env.SUPABASE_CLIENT_ID}:${process.env.SUPABASE_CLIENT_SECRET}`).toString("base64");
  const r = await fetch(API() + "/v1/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json", Authorization: "Basic " + base },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri, code_verifier: verifier }),
  });
  const dati = await r.json().catch(() => ({}));
  return r.ok && dati.access_token ? dati.access_token : null;
}

export function nomeProgetto(login) {
  const pulito = String(login || "io").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "io";
  return "assistente-" + pulito;
}

// Crea il progetto (o riusa quello già creato in precedenza con lo stesso nome).
export async function trovaOCrea(token, login) {
  const nome = nomeProgetto(login);
  const progetti = await chiama(token, "GET", "/v1/projects");
  const esistente = Array.isArray(progetti) ? progetti.find(p => p.name === nome) : null;
  if (esistente) return { ref: esistente.ref ?? esistente.id, nuovo: false };

  const organizzazioni = await chiama(token, "GET", "/v1/organizations");
  const org = Array.isArray(organizzazioni) ? organizzazioni[0] : null;
  if (!org) throw new Error("Non trovo nessuna organizzazione sul tuo account Supabase. Aprine una da supabase.com e riprova.");
  const slug = org.slug || org.id;
  const db_pass = crypto.randomBytes(24).toString("base64url");

  let creato;
  try {
    creato = await chiama(token, "POST", "/v1/projects", { name: nome, db_pass, organization_slug: slug, region_selection: { type: "specific", code: "eu-central-1" } });
  } catch (e) {
    if (e.status === 400 || e.status === 422) {
      // formato regione diverso: riprova con il campo vecchio
      creato = await chiama(token, "POST", "/v1/projects", { name: nome, db_pass, organization_slug: slug, region: "eu-central-1" });
    } else throw e;
  }
  return { ref: creato.ref ?? creato.id, nuovo: true };
}

const STATI_FINALI_MALE = ["INIT_FAILED", "REMOVED", "GOING_DOWN", "RESTORE_FAILED"];

// Un passo avanti: quando il progetto è pronto crea la tabella e legge le chiavi.
export async function avanza(token, ref) {
  const p = await chiama(token, "GET", "/v1/projects/" + ref);
  if (STATI_FINALI_MALE.includes(p.status)) {
    return { errore: "Supabase non è riuscito a preparare il progetto (stato " + p.status + "). Controlla su supabase.com e riprova." };
  }
  if (p.status === "PAUSED") return { errore: "Il progetto è in pausa. Aprilo su supabase.com e premi «Restore project», poi riprova." };
  if (p.status !== "ACTIVE_HEALTHY") return { pronto: false, testo: "Supabase sta preparando il tuo database (1-2 minuti)…" };

  try {
    await chiama(token, "POST", `/v1/projects/${ref}/database/query`, { query: SQL_TABELLA });
  } catch (e) {
    return { pronto: false, testo: "Preparo la tabella dei dati…" };
  }

  const chiavi = await chiama(token, "GET", `/v1/projects/${ref}/api-keys?reveal=true`);
  const lista = Array.isArray(chiavi) ? chiavi : [];
  const k = lista.find(x => x.name === "service_role" && x.api_key) || lista.find(x => x.type === "secret" && x.api_key);
  if (!k) return { errore: "Non riesco a leggere la chiave segreta del progetto. Riprova tra un minuto." };
  const url = `https://${ref}.supabase.co`;
  return { pronto: true, url, blocco: `NEXT_PUBLIC_SUPABASE_URL=${url}\nSUPABASE_SERVICE_ROLE_KEY=${k.api_key}` };
}

export function messaggioAmico(e) {
  const t = String(e?.message || "");
  if (e?.status === 401 || e?.status === 403) return { errore: "Supabase non ci ha dato il permesso. Riprova a collegarlo.", riautorizza: true };
  if (/limit|maximum|free project|quota/i.test(t)) return { errore: "Sul tuo account Supabase hai già il massimo di progetti gratuiti (2). Metti in pausa o elimina un progetto che non usi, poi riprova." };
  return { errore: "Qualcosa non ha funzionato con Supabase: " + t };
}
