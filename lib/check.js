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

// files: Map percorso -> { testo, binario } (stato DOPO le modifiche). cambiati: elenco dei percorsi modificati/creati.
export async function controlla(files, cambiati) {
  const errori = [];
  const es = await esbuild();
  const esiste = p => files.has(p);
  for (const p of cambiati) {
    const f = files.get(p);
    if (!f || f.testo == null) continue;
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
