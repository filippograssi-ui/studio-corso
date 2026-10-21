// Collaudo SENZA Claude contro GitHub vero: legge un repository di prova, fa un commit di prova e lo annulla.
// Uso: GITHUB_TOKEN=... node scripts/test-github-vero.mjs proprietario/repo
import { caricaRepository, faiCommit, annullaCommit, ultimiCommit, statoPubblicazione, gh } from "../lib/github.js";
const [owner, repo] = (process.argv[2] || "").split("/");
const token = process.env.GITHUB_TOKEN;
const rep = await caricaRepository(token, owner, repo);
console.log("ramo:", rep.branch, "| file letti:", rep.files.size, "| testa:", rep.headSha.slice(0, 8));
const g = rep.files.get("app/globals.css");
console.log("globals.css letto:", !!g?.testo, g?.testo?.split("\n").length, "righe");
const nuovo = g.testo.replace("--bg: #f4f5f7;", "--bg: #eaf4ff;");
const sha = await faiCommit(token, owner, repo, rep, new Map([["app/globals.css", nuovo]]), "Studio: collaudo sfondo azzurro");
console.log("commit fatto:", sha.slice(0, 8));
const storia = await ultimiCommit(token, owner, repo, 3);
console.log("ultimi commit:", storia.commit.map(c => c.messaggio));
const annullato = await annullaCommit(token, owner, repo, sha);
console.log("annullato con:", annullato.slice(0, 8));
const rep2 = await caricaRepository(token, owner, repo);
console.log("dopo annulla, sfondo originale:", rep2.files.get("app/globals.css").testo.includes("--bg: #f4f5f7;"));
console.log("pubblicazioni:", JSON.stringify(await statoPubblicazione(token, owner, repo, null)));
