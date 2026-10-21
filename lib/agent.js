// L'agente: riceve la richiesta del docente, usa Claude con degli strumenti per leggere/modificare i file
// del suo repository (in memoria), controlla il risultato e fa UN commit.
import { SYSTEM, STRUMENTI } from "./prompt.js";
import { caricaRepository, faiCommit } from "./github.js";
import { controlla } from "./check.js";

const MAX_GIRI = 18;
const MAX_FILE_CAMBIATI = 25;
const MAX_SCRITTURA = 300_000;
const dormi = ms => new Promise(r => setTimeout(r, ms));

const VIETATI = [/(^|\/)\.env/, /^\.git\//, /^\.github\//, /(^|\/)node_modules\//, /^package-lock\.json$/, /^\.next\//];

function pulisciPercorso(p) {
  const s = String(p || "").replace(/\\/g, "/").replace(/^\.?\//, "").trim();
  if (!s || s.split("/").some(x => x === ".." || x === "")) return null;
  return s;
}

async function chiamaClaude(corpo) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("Studio non è configurato: manca la chiave ANTHROPIC_API_KEY su Vercel.");
  for (let t = 0; t < 4; t++) {
    const r = await fetch((process.env.ANTHROPIC_API_URL || "https://api.anthropic.com") + "/v1/messages", {
      method: "POST",
      headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify(corpo),
    });
    if (r.ok) return r.json();
    if ([429, 500, 502, 503, 529].includes(r.status) && t < 3) { await dormi(2000 * (t + 1)); continue; }
    const txt = await r.text();
    const e = new Error(`Claude ${r.status}: ${txt.slice(0, 300)}`);
    e.status = r.status;
    throw e;
  }
}

const MODELLI_DI_RISERVA = ["claude-sonnet-4-5"];
async function chiamaConFallback(corpo) {
  try {
    return await chiamaClaude(corpo);
  } catch (e) {
    if (e.status === 404 && !process.env.STUDIO_MODEL) {
      for (const m of MODELLI_DI_RISERVA) {
        try { return await chiamaClaude({ ...corpo, model: m }); } catch (e2) { if (e2.status !== 404) throw e2; }
      }
    }
    throw e;
  }
}

function conCache(msgs) {
  const c = JSON.parse(JSON.stringify(msgs));
  const ultimo = c[c.length - 1];
  if (typeof ultimo.content === "string") ultimo.content = [{ type: "text", text: ultimo.content }];
  ultimo.content[ultimo.content.length - 1].cache_control = { type: "ephemeral" };
  return c;
}

function storiaPulita(storia, richiesta) {
  const out = [];
  for (const m of (Array.isArray(storia) ? storia : []).slice(-10)) {
    if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string" || !m.content.trim()) continue;
    const testo = m.content.slice(0, 1500);
    if (out.length && out[out.length - 1].role === m.role) out[out.length - 1].content += "\n" + testo;
    else out.push({ role: m.role, content: testo });
  }
  while (out.length && out[0].role !== "user") out.shift();
  if (out.length && out[out.length - 1].role === "user") out.pop(); // la richiesta nuova è un messaggio "user": evita due user di fila
  out.push({ role: "user", content: richiesta });
  return out;
}

export async function eseguiRichiesta({ token, owner, repo, richiesta, storia, onEvent = () => {} }) {
  onEvent({ type: "stato", testo: "Leggo il tuo sito…" });
  const rep = await caricaRepository(token, owner, repo);
  const originali = rep.files;
  const corrente = new Map(originali);

  const elenco = [...originali.keys()].sort().map(p => p + (originali.get(p).binario ? " [binario]" : "")).slice(0, 700);
  const contesto = `Repository: ${owner}/${repo} (ramo ${rep.branch}). File presenti (${originali.size}):\n${elenco.join("\n")}`;

  const sintesi = u => {
    const i = u.input || {};
    if (u.name === "search") return `Cerco "${String(i.pattern || "").slice(0, 40)}"`;
    if (u.name === "read_file") return `Leggo ${i.path}`;
    if (u.name === "edit_file") return `Modifico ${i.path}`;
    if (u.name === "write_file") return `Scrivo ${i.path}`;
    if (u.name === "delete_file") return `Elimino ${i.path}`;
    return u.name;
  };

  function esegui(u) {
    const i = u.input || {};
    try {
      if (u.name === "search") {
        let re;
        try { re = new RegExp(String(i.pattern), "i"); } catch { re = new RegExp(String(i.pattern).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"); }
        const dir = i.dir ? pulisciPercorso(i.dir) : null;
        const out = [];
        for (const [p, f] of corrente) {
          if (f.testo == null || (dir && !p.startsWith(dir))) continue;
          const righe = f.testo.split("\n");
          for (let n = 0; n < righe.length && out.length < 40; n++) if (re.test(righe[n])) out.push(`${p}:${n + 1}: ${righe[n].trim().slice(0, 200)}`);
          if (out.length >= 40) break;
        }
        return out.length ? out.join("\n") : "Nessun risultato.";
      }
      const p = pulisciPercorso(i.path);
      if (!p) return { errore: "Percorso non valido." };
      if (u.name === "read_file") {
        const f = corrente.get(p);
        if (!f) {
          const nome = p.split("/").pop();
          const simili = [...corrente.keys()].filter(k => k.endsWith("/" + nome) || k.includes(nome)).slice(0, 5);
          return { errore: `File non trovato: ${p}.` + (simili.length ? ` Forse intendevi: ${simili.join(", ")}` : "") };
        }
        if (f.testo == null) return { errore: "File binario o troppo grande: non leggibile." };
        const righe = f.testo.split("\n");
        const da = Math.max(1, i.start || 1);
        let a = i.end || righe.length;
        let nota = "";
        if (!i.start && !i.end && righe.length > 400) { a = 400; nota = `\n[File lungo: ${righe.length} righe. Mostrate le prime 400. Usa start/end o search per il resto.]`; }
        return righe.slice(da - 1, a).map((r, k) => `${da + k}\t${r}`).join("\n") + nota;
      }
      if (VIETATI.some(re => re.test(p))) return { errore: `Il percorso ${p} è protetto: non si può modificare.` };
      if (u.name === "edit_file") {
        const f = corrente.get(p);
        if (!f || f.testo == null) return { errore: `File non modificabile o inesistente: ${p}.` };
        const vecchio = String(i.old_str ?? "");
        if (!vecchio) return { errore: "old_str è vuoto." };
        const pezzi = f.testo.split(vecchio).length - 1;
        if (pezzi === 0) return { errore: "old_str non trovato: controlla spazi e indentazione, rileggi il file con read_file e riprova." };
        if (pezzi > 1) return { errore: `old_str compare ${pezzi} volte: aggiungi righe intorno per renderlo unico.` };
        const idx = f.testo.indexOf(vecchio);
        const nuovo = f.testo.slice(0, idx) + String(i.new_str ?? "") + f.testo.slice(idx + vecchio.length);
        corrente.set(p, { testo: nuovo, size: nuovo.length, binario: false });
        return "OK, modificato.";
      }
      if (u.name === "write_file") {
        const c = String(i.content ?? "");
        if (c.length > MAX_SCRITTURA) return { errore: "File troppo grande." };
        const f = corrente.get(p);
        if (f && f.testo == null) return { errore: "Non si può sovrascrivere un file binario." };
        corrente.set(p, { testo: c, size: c.length, binario: false });
        return f ? "OK, file riscritto." : "OK, file creato.";
      }
      if (u.name === "delete_file") {
        if (!corrente.has(p)) return { errore: "File inesistente." };
        corrente.delete(p);
        return "OK, eliminato.";
      }
      return { errore: "Strumento sconosciuto." };
    } catch (e) {
      return { errore: String(e.message || e) };
    }
  }

  function cambiamenti() {
    const cambi = new Map();
    for (const [p, f] of corrente) {
      const o = originali.get(p);
      if (!o || o.testo !== f.testo) cambi.set(p, f.testo);
    }
    for (const p of originali.keys()) if (!corrente.has(p)) cambi.set(p, null);
    return cambi;
  }

  const modello = process.env.STUDIO_MODEL || "claude-sonnet-5";
  const messaggi = storiaPulita(storia, richiesta);
  const uso = { input: 0, output: 0, cacheLetta: 0, cacheScritta: 0, chiamate: 0 };
  let testoFinale = "";
  let tentativiControllo = 0;
  let finito = false;
  let usatoModifica = false;
  let avvisatoNessuna = false;

  onEvent({ type: "stato", testo: "Ci penso…" });
  for (let giro = 0; giro < MAX_GIRI; giro++) {
    const risp = await chiamaConFallback({
      model: modello,
      max_tokens: 16000,
      system: [
        { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
        { type: "text", text: contesto, cache_control: { type: "ephemeral" } },
      ],
      tools: STRUMENTI,
      messages: conCache(messaggi),
    });
    uso.chiamate++;
    uso.input += risp.usage?.input_tokens || 0;
    uso.output += risp.usage?.output_tokens || 0;
    uso.cacheLetta += risp.usage?.cache_read_input_tokens || 0;
    uso.cacheScritta += risp.usage?.cache_creation_input_tokens || 0;

    messaggi.push({ role: "assistant", content: risp.content });
    const usi = risp.content.filter(b => b.type === "tool_use");
    const testo = risp.content.filter(b => b.type === "text").map(b => b.text).join("\n").trim();

    if (!usi.length) {
      if (risp.stop_reason === "max_tokens") {
        messaggi.push({ role: "user", content: "Ti sei interrotto perché la risposta era troppo lunga. Procedi a passi più piccoli (edit_file mirati) e poi riscrivi il riepilogo." });
        continue;
      }
      const cambi = cambiamenti();
      if (cambi.size === 0 && usatoModifica && !avvisatoNessuna) {
        avvisatoNessuna = true;
        messaggi.push({ role: "user", content: "Attenzione: risulta che nessuna modifica sia stata applicata ai file (forse uno strumento ha dato errore). Verifica con read_file e rifai la modifica; se non è davvero possibile, spiega onestamente perché." });
        continue;
      }
      if (cambi.size === 0) { testoFinale = testo; finito = true; break; }
      onEvent({ type: "stato", testo: "Controllo che tutto funzioni…" });
      const errori = await controlla(corrente, [...cambi.keys()].filter(p => corrente.has(p)));
      if (errori.length) {
        if (tentativiControllo >= 2) throw new Error("Non sono riuscito a produrre una modifica corretta, quindi non ho cambiato nulla. Prova a descrivere la richiesta in modo più semplice o a spezzarla in due. (" + errori[0].slice(0, 160) + ")");
        tentativiControllo++;
        onEvent({ type: "stato", testo: "Trovato un errore: lo correggo…" });
        messaggi.push({ role: "user", content: "Controllo automatico: ci sono errori da correggere prima di salvare.\n- " + errori.join("\n- ") + "\nCorreggili con gli strumenti, poi riscrivi il riepilogo." });
        continue;
      }
      testoFinale = testo;
      finito = true;
      break;
    }

    const risultati = [];
    for (const u of usi) {
      onEvent({ type: "strumento", nome: u.name, testo: sintesi(u) });
      if (u.name === "edit_file" || u.name === "write_file" || u.name === "delete_file") usatoModifica = true;
      const r = esegui(u);
      const err = typeof r === "object" && r.errore;
      risultati.push({ type: "tool_result", tool_use_id: u.id, content: (err ? r.errore : r).toString().slice(0, 40_000), ...(err ? { is_error: true } : {}) });
    }
    messaggi.push({ role: "user", content: risultati });
  }
  if (!finito) throw new Error("La richiesta è troppo grande per un solo passaggio. Provala a spezzare in richieste più piccole.");

  const cambi = cambiamenti();
  if (cambi.size === 0) return { sha: null, files: [], testo: testoFinale, uso };
  if (cambi.size > MAX_FILE_CAMBIATI) throw new Error(`La modifica toccherebbe ${cambi.size} file: sono troppi. Non ho cambiato nulla; prova con una richiesta più piccola.`);

  onEvent({ type: "stato", testo: "Salvo le modifiche sul tuo repository…" });
  const titolo = richiesta.replace(/\s+/g, " ").trim().slice(0, 70);
  const sha = await faiCommit(token, owner, repo, rep, cambi, `Studio: ${titolo}`);
  return { sha, files: [...cambi.keys()], testo: testoFinale, uso, branch: rep.branch };
}
