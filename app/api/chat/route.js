import { leggiSessione } from "@/lib/session";
import { eseguiRichiesta } from "@/lib/agent";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function messaggioAmico(e) {
  const t = String(e?.message || e);
  if (/Claude 401|x-api-key|invalid.*api.*key/i.test(t)) return "Studio non riesce a usare Claude (chiave non valida). Avvisa il docente.";
  if (/Claude 429|rate.?limit/i.test(t)) return "Troppe richieste in questo momento. Aspetta qualche secondo e riprova.";
  if (/Claude 400.*credit|credit balance/i.test(t)) return "Il credito di Claude per il corso è finito. Avvisa il docente.";
  if (/GitHub 401|Bad credentials/i.test(t)) return "L'accesso a GitHub è scaduto: esci e rientra.";
  if (/GitHub 403|GitHub 404/i.test(t)) return "Non riesco ad accedere a questo repository. Controlla di aver scelto quello giusto.";
  return t.length > 400 ? t.slice(0, 400) + "…" : t;
}

export async function POST(req) {
  const s = await leggiSessione().catch(() => null);
  if (!s?.token || !s?.repo) return Response.json({ errore: "Accedi e scegli il repository." }, { status: 401 });
  const corpo = await req.json().catch(() => ({}));
  const { storia } = corpo;
  // Foto/screenshot allegati: al massimo 3, JPEG/PNG/WebP/GIF in base64 (il browser li rimpicciolisce prima di inviarli).
  const immagini = Array.isArray(corpo.immagini) ? corpo.immagini.slice(0, 3) : [];
  const IMMAGINE = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/;
  const valide = immagini.map(u => (typeof u === "string" && u.length <= 1_800_000 ? IMMAGINE.exec(u) : null));
  if (valide.some(m => !m)) return Response.json({ errore: "Una delle foto non è valida o è troppo grande. Riprova con un'altra." }, { status: 400 });
  const blocchiImmagine = valide.map(m => ({ type: "image", source: { type: "base64", media_type: m[1], data: m[2] } }));
  const richiesta = typeof corpo.richiesta === "string" && corpo.richiesta.trim()
    ? corpo.richiesta
    : blocchiImmagine.length ? "Guarda la foto: dimmi cosa non va e, se riguarda il mio sito, sistemalo." : "";
  if (!richiesta.trim() || richiesta.length > 4000) return Response.json({ errore: "Scrivi cosa vuoi cambiare (massimo 4000 caratteri)." }, { status: 400 });
  const [owner, repo] = s.repo.split("/");
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const invia = o => { try { controller.enqueue(enc.encode(JSON.stringify(o) + "\n")); } catch {} };
      try {
        const r = await eseguiRichiesta({ token: s.token, owner, repo, richiesta: richiesta.trim(), immagini: blocchiImmagine, storia, onEvent: invia });
        console.log("studio", JSON.stringify({ utente: s.login, repo: s.repo, file: r.files.length, uso: r.uso }));
        invia({ type: "fine", testo: r.testo, sha: r.sha, files: r.files });
      } catch (e) {
        console.error("studio errore", s.login, e?.message);
        invia({ type: "errore", testo: messaggioAmico(e) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" } });
}
