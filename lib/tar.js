// Lettore minimo di archivi .tar.gz (quelli che GitHub genera per un repository).
import zlib from "node:zlib";

const MAX_FILE = 400_000; // oltre questa dimensione un file non viene letto

export function leggiTarGz(buffer) {
  const tar = zlib.gunzipSync(buffer);
  const files = new Map(); // percorso -> { testo: string|null, size, binario }
  let pos = 0;
  let nomePax = null;
  while (pos + 512 <= tar.length) {
    const h = tar.subarray(pos, pos + 512);
    if (h.every(b => b === 0)) break;
    let nome = h.subarray(0, 100).toString("utf8").replace(/\0.*$/s, "");
    const prefisso = h.subarray(345, 500).toString("utf8").replace(/\0.*$/s, "");
    if (prefisso) nome = prefisso + "/" + nome;
    const size = parseInt(h.subarray(124, 136).toString("utf8").replace(/\0.*$/s, "").trim() || "0", 8);
    const tipo = String.fromCharCode(h[156] || 48);
    const corpo = tar.subarray(pos + 512, pos + 512 + size);
    pos += 512 + Math.ceil(size / 512) * 512;
    if (tipo === "x") { // intestazione pax: può contenere il nome lungo
      const m = corpo.toString("utf8").match(/\d+ path=([^\n]+)\n/);
      if (m) nomePax = m[1];
      continue;
    }
    if (tipo === "g") continue;
    const nomeFinale = nomePax || nome;
    nomePax = null;
    if (tipo !== "0" && tipo !== "\0") continue; // salta cartelle e collegamenti
    const percorso = nomeFinale.split("/").slice(1).join("/"); // toglie la cartella radice "utente-repo-sha"
    if (!percorso) continue;
    const binario = size > MAX_FILE || corpo.subarray(0, 8000).includes(0);
    files.set(percorso, { testo: binario ? null : corpo.toString("utf8"), size, binario });
  }
  return files;
}
