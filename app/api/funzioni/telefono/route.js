import { NextResponse } from "next/server";
import { leggiSessione } from "@/lib/session";
import { caricaRepository, faiCommit } from "@/lib/github";
import { applicaTelefono } from "@/lib/telefono";
import { controlla } from "@/lib/check";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Aggiunge al sito del partecipante: installazione sul telefono + notifiche. Niente Claude: è una funzione fissa.
export async function POST() {
  const s = await leggiSessione().catch(() => null);
  if (!s?.token || !s?.repo) return NextResponse.json({ errore: "Accedi e scegli il repository." }, { status: 401 });
  const [owner, repo] = s.repo.split("/");
  try {
    const rep = await caricaRepository(s.token, owner, repo);
    if (!rep.files.has("package.json") || !rep.files.has("app/layout.js")) {
      return NextResponse.json({ errore: "Questo repository non sembra il sito del corso (mancano package.json o app/layout.js)." }, { status: 400 });
    }
    const { cambi, avvisi } = applicaTelefono(rep.files);
    if (!cambi.size) return NextResponse.json({ sha: null, files: [], avvisi, gia: true });
    // controllo di sintassi sui file di testo toccati, come per le richieste normali
    const dopo = new Map(rep.files);
    for (const [p, v] of cambi) dopo.set(p, typeof v === "string" ? { testo: v, size: v.length, binario: false } : { testo: null, size: v.length, binario: true });
    const errori = await controlla(dopo, [...cambi.keys()].filter(p => /\.(js|jsx|mjs|css|json)$/.test(p)), rep.files).catch(() => []);
    if (errori.length) return NextResponse.json({ errore: "Non ho salvato niente: " + errori[0].slice(0, 200) }, { status: 400 });
    const sha = await faiCommit(s.token, owner, repo, rep, cambi, "Studio: sul telefono e notifiche");
    return NextResponse.json({ sha, files: [...cambi.keys()], avvisi, gia: false });
  } catch (e) {
    return NextResponse.json({ errore: e.message }, { status: e.status === 403 ? 403 : 400 });
  }
}
