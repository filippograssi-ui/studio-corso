// Controlli veloci PRIMA del commit: sintassi dei file JS/JSON e import che puntano a file che non esistono.
let _esbuild;
async function esbuild() {
  if (_esbuild === undefined) {
    try { _esbuild = await import("esbuild"); } catch { _esbuild = null; }
  }
  return _esbuild;
}

const ESTENSIONI = ["", ".js", ".jsx", ".mjs", ".json", ".css", "/index.js", "/index.jsx"];

function risolvi(da, spec, esiste) {
  let base;
  if (spec.startsWith("@/")) base = spec.slice(2);
  else {
    const parti = da.split("/").slice(0, -1);
    for (const p of spec.split("/")) {
      if (p === "." || p === "") continue;
      if (p === "..") parti.pop(); else parti.push(p);
    }
    base = parti.join("/");
  }
  return ESTENSIONI.some(e => esiste(base + e));
}

// CSS: parentesi graffe bilanciate e nessun avviso del parser (es. proprietà senza selettore).
async function erroriCss(testo, p, es) {
  const out = [];
  const pulito = testo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/g, '""');
  let livello = 0;
  for (const c of pulito) { if (c === "{") livello++; else if (c === "}") livello--; if (livello < 0) break; }
  if (livello !== 0) out.push(`${p}: parentesi graffe non bilanciate (una "{" o "}" di troppo o mancante)`);
  if (es) {
    try {
      const r = await es.transform(testo, { loader: "css", sourcefile: p, logLevel: "silent" });
      for (const w of r.warnings || []) out.push(`${p}:${w.location?.line ?? "?"} ${w.text}`);
    } catch (e) {
      for (const x of (e.errors || []).slice(0, 3)) out.push(`${p}:${x.location?.line ?? "?"} ${x.text}`);
    }
  }
  return out;
}

// files: Map percorso -> { testo, binario } (stato DOPO le modifiche). cambiati: elenco dei percorsi modificati/creati.
export async function controlla(files, cambiati, originali = null) {
  const errori = [];
  const es = await esbuild();
  const esiste = p => files.has(p);
  for (const p of cambiati) {
    const f = files.get(p);
    if (!f || f.testo == null) continue;
    if (/\.css$/.test(p)) {
      const e1 = await erroriCss(f.testo, p, es);
      if (e1.length) {
        const prima = originali?.get(p)?.testo != null ? await erroriCss(originali.get(p).testo, p, es) : [];
        if (e1.length > prima.length) errori.push(...e1.slice(0, 3));
      }
      continue;
    }
    if (/\.json$/.test(p)) {
      try { JSON.parse(f.testo); } catch (e) { errori.push(`${p}: JSON non valido (${e.message})`); }
      continue;
    }
    if (!/\.(js|jsx|mjs|cjs)$/.test(p)) continue;
    if (es) {
      try {
        await es.transform(f.testo, { loader: "jsx", sourcefile: p, logLevel: "silent" });
      } catch (e) {
        const dettagli = (e.errors || []).slice(0, 3).map(x => `${p}:${x.location?.line ?? "?"} ${x.text}`).join(" | ");
        errori.push(dettagli || `${p}: errore di sintassi`);
        continue;
      }
    }
    const re = /(?:from\s+|import\s*\(\s*|require\s*\(\s*|^\s*import\s+)["']([^"']+)["']/gm;
    let m;
    while ((m = re.exec(f.testo))) {
      const spec = m[1];
      if (!(spec.startsWith("./") || spec.startsWith("../") || spec.startsWith("@/"))) continue;
      if (!risolvi(p, spec, esiste)) errori.push(`${p}: importa "${spec}" ma quel file non esiste`);
    }
  }
  return errori;
}

// Righe estranee rimaste da un copia-incolla: l'etichetta del riquadro di codice ("js", "css", "zza · JS"...)
// all'inizio del file, oppure le virgolette ``` all'inizio/in fondo. Rompono la pubblicazione su Vercel.
const ETICHETTA = /^\s*(js|jsx|mjs|javascript|ts|tsx|typescript|css|json|html)\s*$/i;
const ETICHETTA_CON_PUNTO = /[·•]\s*(js|jsx|mjs|javascript|ts|tsx|typescript|css|json|html)\s*$/i;
const RECINTO = /^\s*```[a-z]*\s*$/i;

export function riparaTesto(percorso, testo) {
  if (!/\.(js|jsx|mjs|css|json)$/i.test(percorso) || typeof testo !== "string") return null;
  const righe = testo.split("\n");
  let i = 0;
  while (i < righe.length && !righe[i].trim()) i++;
  let cambiato = false;
  const tolte = [];
  while (i < righe.length && righe[i].length < 60 && (ETICHETTA.test(righe[i]) || ETICHETTA_CON_PUNTO.test(righe[i]) || RECINTO.test(righe[i]))) {
    tolte.push(righe[i].trim());
    righe.splice(i, 1);
    cambiato = true;
  }
  let j = righe.length - 1;
  while (j >= 0 && !righe[j].trim()) j--;
  while (j >= 0 && RECINTO.test(righe[j])) { tolte.push(righe[j].trim()); righe.splice(j, 1); cambiato = true; j--; while (j >= 0 && !righe[j].trim()) j--; }
  return cambiato ? { testo: righe.join("\n"), tolte } : null;
}

// Ripara tutti i file di testo della mappa (modifica la mappa) e restituisce l'elenco dei file sistemati.
export function riparaFiles(files) {
  const sistemati = [];
  for (const [p, f] of files) {
    if (!f || f.testo == null) continue;
    const r = riparaTesto(p, f.testo);
    if (r) { files.set(p, { ...f, testo: r.testo, size: r.testo.length }); sistemati.push({ percorso: p, tolte: r.tolte }); }
  }
  return sistemati;
}
