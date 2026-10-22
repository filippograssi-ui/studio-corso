// Collaudo con un GitHub FINTO (in memoria): nessun repository vero viene toccato.
// Uso: ANTHROPIC_API_KEY=... node scripts/test-finto.mjs <cartella-repo-da-copiare> "richiesta 1" "richiesta 2" ...
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";

const [, , sorgente, ...richieste] = process.argv;
const sha1 = s => crypto.createHash("sha1").update(s).digest("hex");

// --- stato del finto GitHub
const blobs = new Map();   // sha -> testo
const alberi = new Map();  // sha -> Map(path -> blobSha)
const commit = new Map();  // sha -> { tree, parents, message }
let testa;

function aggiungiBlob(t) { const s = sha1("blob" + t); blobs.set(s, t); return s; }
function iniziale() {
  const files = execSync(`git -C "${sorgente}" ls-files`, { encoding: "utf8", maxBuffer: 1e8 }).split("\n").filter(Boolean);
  const m = new Map();
  for (const f of files) {
    const b = fs.readFileSync(path.join(sorgente, f));
    if (b.subarray(0, 8000).includes(0) || b.length > 400000) continue; // niente binari nel finto
    m.set(f, aggiungiBlob(b.toString("utf8")));
  }
  const t = sha1("tree" + [...m].join()); alberi.set(t, m);
  const c = sha1("commit-0" + t); commit.set(c, { tree: t, parents: [], message: "inizio" }); testa = c;
}
iniziale();

function tarGz(treeSha) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "finto-"));
  const nome = "utente-repo-" + testa.slice(0, 7);
  const radice = path.join(dir, nome);
  for (const [p, b] of alberi.get(treeSha)) { fs.mkdirSync(path.dirname(path.join(radice, p)), { recursive: true }); fs.writeFileSync(path.join(radice, p), blobs.get(b)); }
  const out = path.join(dir, "x.tgz");
  execSync(`tar czf "${out}" "${nome}"`, { cwd: dir });
  return fs.readFileSync(out);
}

const server = http.createServer((req, res) => {
  let corpo = "";
  req.on("data", d => (corpo += d));
  req.on("end", () => {
    const json = (o, s = 200) => { res.writeHead(s, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); };
    const u = req.url.split("?")[0];
    const b = corpo ? JSON.parse(corpo) : {};
    let m;
    if (u === "/repos/utente/repo") return json({ default_branch: "main", permissions: { push: true }, full_name: "utente/repo" });
    if (u === "/repos/utente/repo/git/ref/heads/main" && req.method === "GET") return json({ object: { sha: testa } });
    if ((m = u.match(/^\/repos\/utente\/repo\/git\/commits\/(\w+)$/)) && req.method === "GET") { const c = commit.get(m[1]); return c ? json({ sha: m[1], tree: { sha: c.tree }, message: c.message, parents: c.parents.map(sha => ({ sha })) }) : json({}, 404); }
    if (u.startsWith("/repos/utente/repo/tarball/")) { const c = commit.get(u.split("/").pop()); const buf = tarGz(c.tree); res.writeHead(200, { "Content-Type": "application/gzip" }); return res.end(buf); }
    if ((m = u.match(/^\/repos\/utente\/repo\/git\/trees\/(\w+)$/)) && req.method === "GET") { const t = alberi.get(m[1]); return t ? json({ sha: m[1], truncated: false, tree: [...t].map(([path, sha]) => ({ path, mode: "100644", type: "blob", sha })) }) : json({ message: "no" }, 404); }
    if (u === "/repos/utente/repo/git/blobs") return json({ sha: aggiungiBlob(b.content) }, 201);
    if (u === "/repos/utente/repo/git/trees") {
      const base = new Map(alberi.get(b.base_tree));
      for (const e of b.tree) { if (e.sha === null) base.delete(e.path); else base.set(e.path, e.sha); }
      const t = sha1("tree" + [...base].join()); alberi.set(t, base); return json({ sha: t }, 201);
    }
    if (u === "/repos/utente/repo/git/commits" && req.method === "POST") { const c = sha1("commit" + JSON.stringify(b) + Math.random()); commit.set(c, { tree: b.tree, parents: b.parents, message: b.message }); return json({ sha: c }, 201); }
    if (u === "/repos/utente/repo/git/refs/heads/main" && req.method === "PATCH") { testa = b.sha; return json({ ref: "ok" }); }
    json({ message: "finto: non gestito " + req.method + " " + u }, 404);
  });
});
await new Promise(r => server.listen(4010, r));
process.env.GITHUB_API_URL = "http://localhost:4010";


// --- finto Claude (solo se FINTO_CLAUDE=1): risposte già scritte, per provare tutto il meccanismo senza chiave
function avviaClaudeFinto() {
  const uso = { input_tokens: 10, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  const tool = (name, input) => ({ stop_reason: "tool_use", usage: uso, content: [{ type: "tool_use", id: "t" + Math.random().toString(36).slice(2), name, input }] });
  const fine = testo => ({ stop_reason: "end_turn", usage: uso, content: [{ type: "text", text: testo }] });
  const scenari = {
    sfondo: [
      () => tool("search", { pattern: "--bg" }),
      () => tool("read_file", { path: "app/globals.css", start: 1, end: 12 }),
      () => tool("edit_file", { path: "app/globals.css", old_str: "--bg: #f4f5f7;", new_str: "--bg: #eaf4ff;" }),
      () => fine("Ho cambiato lo sfondo in un azzurro molto chiaro. Lo vedi in tutte le pagine."),
    ],
    menu: [
      () => tool("search", { pattern: "Svago" }),
      () => tool("edit_file", { path: "components/TopBar.js", old_str: 'label: "Svago"', new_str: 'label: "Tempo libero"' }),
      () => fine("Nel menu in alto ora la voce si chiama Tempo libero."),
    ],
    errore: [
      () => tool("write_file", { path: "lib/rotto.js", content: "import x from './non-esiste.js';\nexport const a = ;\n" }),
      () => fine("Fatto."),
      () => tool("write_file", { path: "lib/rotto.js", content: "export const a = 1;\n" }),
      () => fine("Ho aggiunto un piccolo file di prova."),
    ],
    nuovo: [
      () => tool("write_file", { path: "lib/nuovo-file.js", content: "export const ciao = 1;\n" }),
      () => fine("Ho aggiunto un file nuovo."),
    ],
    css: [
      () => tool("read_file", { path: "app/globals.css", start: 1, end: 5 }),
      () => tool("edit_file", { path: "app/globals.css", old_str: "--bg: #f4f5f7;", new_str: "--bg: #eaf4ff; }\n  flex: 1; min-width: 130px;" }),
      () => fine("Fatto, ho cambiato lo sfondo."),
      () => tool("edit_file", { path: "app/globals.css", old_str: "--bg: #eaf4ff; }\n  flex: 1; min-width: 130px;", new_str: "--bg: #eaf4ff;" }),
      () => fine("Ho cambiato lo sfondo (versione corretta)."),
    ],
    domanda: [() => fine("Che colore preferisci, e per quale parte del sito?")],
  };
  const srv = http.createServer((req, res) => {
    let c = ""; req.on("data", d => (c += d));
    req.on("end", () => {
      const b = JSON.parse(c);
      const msgs = b.messages;
      const testoDi = m => (typeof m.content === "string" ? m.content : m.content.filter(x => x.type === "text").map(x => x.text).join(" "));
      const trovato = [...msgs].reverse().find(m => m.role === "user" && testoDi(m) && !testoDi(m).startsWith("Controllo automatico"));
      const richiesta = { content: testoDi(trovato) };
      const chiave = /sfondo/i.test(richiesta.content) ? "sfondo" : /svago|menu/i.test(richiesta.content) ? "menu" : /errore/i.test(richiesta.content) ? "errore" : /nuovo/i.test(richiesta.content) ? "nuovo" : /css/i.test(richiesta.content) ? "css" : "domanda";
      console.log("   [mock] chiave=" + chiave + " richiesta=" + JSON.stringify(richiesta.content.slice(0,50)));
      const passo = msgs.filter(m => m.role === "assistant" && Array.isArray(m.content)).length;
      const r = (scenari[chiave][passo] || (() => fine("Fatto.")))();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ id: "msg", type: "message", role: "assistant", model: b.model, ...r }));
    });
  });
  return new Promise(ok => srv.listen(4011, () => { process.env.ANTHROPIC_API_URL = "http://localhost:4011"; process.env.ANTHROPIC_API_KEY = "finta"; ok(srv); }));
}
let claudeFinto = null;
if (process.env.FINTO_CLAUDE === "1") claudeFinto = await avviaClaudeFinto();

const { eseguiRichiesta } = await import("../lib/agent.js");
const { annullaCommit } = await import("../lib/github.js");

const storia = [];
const fatti = [];
const t0 = Date.now();
for (const richiesta of richieste) {
  console.log("\n=== RICHIESTA:", richiesta);
  const r = await eseguiRichiesta({ token: "finto", owner: "utente", repo: "repo", richiesta, storia, onEvent: e => console.log("  ·", e.testo || e.type) });
  console.log("RISPOSTA:", r.testo);
  console.log("FILE CAMBIATI:", r.files, "| commit:", r.sha ? r.sha.slice(0, 8) : "nessuno");
  console.log("USO:", JSON.stringify(r.uso));
  fatti.push(r);
  storia.push({ role: "user", content: richiesta }, { role: "assistant", content: r.testo });
}
console.log("\nTempo totale:", Math.round((Date.now() - t0) / 1000), "s");

// prova "annulla" sull'ultimo commit di Studio
if (richieste.length) {
  const prima = testa;
  const nuovo = await annullaCommit("finto", "utente", "repo", prima);
  const alberoPrima = alberi.get(commit.get(commit.get(prima).parents[0]).tree);
  const alberoDopo = alberi.get(commit.get(nuovo).tree);
  const uguali = alberoPrima.size === alberoDopo.size && [...alberoPrima].every(([p, s]) => alberoDopo.get(p) === s);
  console.log("ANNULLA: il sito è tornato a prima dell'ultima modifica:", uguali);
  // rimetto lo stato PRIMA dell'annulla per esportare l'albero modificato
  testa = prima;
}
if (process.env.ANNULLA_PRIMO && fatti.length >= 2 && fatti[0].sha && fatti[1].sha) {
  const nuovo = await annullaCommit("finto", "utente", "repo", fatti[0].sha);
  const finale = alberi.get(commit.get(nuovo).tree), prima0 = alberi.get(commit.get(commit.get(fatti[0].sha).parents[0]).tree), dopo1 = alberi.get(commit.get(fatti[1].sha).tree);
  const soloPrimo = fatti[0].files.filter(f => !fatti[1].files.includes(f));
  const primoRipristinato = soloPrimo.every(f => finale.get(f) === prima0.get(f));
  const secondoIntatto = fatti[1].files.every(f => finale.get(f) === dopo1.get(f));
  console.log("ANNULLA PRIMO: file del primo ripristinati:", primoRipristinato, "| modifica del secondo intatta:", secondoIntatto, "| file toccati dal 1°:", fatti[0].files, "2°:", fatti[1].files);
}
// esporto l'albero finale (dopo tutte le richieste) in una cartella per provare la build
const out = process.env.ESPORTA;
if (out) {
  fs.rmSync(out, { recursive: true, force: true });
  for (const [p, b] of alberi.get(commit.get(testa).tree)) { fs.mkdirSync(path.dirname(path.join(out, p)), { recursive: true }); fs.writeFileSync(path.join(out, p), blobs.get(b)); }
  console.log("Esportato in", out);
}
server.close();
if (claudeFinto) claudeFinto.close();
