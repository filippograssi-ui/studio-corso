// Collaudo di lib/supabase.js contro un Supabase FINTO (nessun account vero).
// Uso: node scripts/test-supabase.mjs
import http from "node:http";
import assert from "node:assert/strict";

let progetti = [], giriPronto = 0, sqlEseguito = null, regioneRifiutata = process.env.REGIONE_VECCHIA === "1";
const srv = http.createServer((req, res) => {
  let corpo = ""; req.on("data", c => corpo += c);
  req.on("end", () => {
    const json = (c, o) => { res.writeHead(c, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); };
    if (req.headers.authorization !== "Bearer tok123" && !req.url.includes("/oauth/")) return json(401, { message: "Unauthorized" });
    const u = req.url;
    if (u === "/v1/oauth/token") {
      assert.match(req.headers.authorization, /^Basic /);
      const p = new URLSearchParams(corpo);
      assert.equal(p.get("grant_type"), "authorization_code"); assert.ok(p.get("code_verifier"));
      return json(200, { access_token: "tok123", refresh_token: "r" });
    }
    if (u === "/v1/projects" && req.method === "GET") return json(200, progetti);
    if (u === "/v1/organizations") return json(200, [{ id: "o1", slug: "miaorg", name: "Mia" }]);
    if (u === "/v1/projects" && req.method === "POST") {
      const b = JSON.parse(corpo);
      assert.equal(b.organization_slug, "miaorg"); assert.ok(b.db_pass.length >= 20);
      if (regioneRifiutata && b.region_selection) return json(400, { message: "region_selection non valido" });
      progetti.push({ ref: "abcdefghijklmnopqrst", name: b.name });
      return json(201, { ref: "abcdefghijklmnopqrst", status: "COMING_UP" });
    }
    if (u === "/v1/projects/abcdefghijklmnopqrst") return json(200, { status: ++giriPronto < 3 ? "COMING_UP" : "ACTIVE_HEALTHY" });
    if (u === "/v1/projects/abcdefghijklmnopqrst/database/query") { sqlEseguito = JSON.parse(corpo).query; return json(201, []); }
    if (u.startsWith("/v1/projects/abcdefghijklmnopqrst/api-keys")) { assert.ok(u.includes("reveal=true")); return json(200, [{ name: "anon", api_key: "ANON" }, { name: "service_role", api_key: "SERVICE-KEY" }]); }
    json(404, { message: "no " + u });
  });
});
await new Promise(r => srv.listen(0, r));
process.env.SUPABASE_API = "http://127.0.0.1:" + srv.address().port;
process.env.SUPABASE_CLIENT_ID = "id"; process.env.SUPABASE_CLIENT_SECRET = "sec";
const L = await import("../lib/supabase.js");

assert.equal(L.configurato(), true);
assert.equal(await L.scambiaCodice("c", "v", "http://x/cb"), "tok123");
assert.equal(L.nomeProgetto("Maria_Rossi!"), "assistente-maria-rossi");
let a = await L.trovaOCrea("tok123", "Maria"); assert.equal(a.nuovo, true); assert.equal(a.ref, "abcdefghijklmnopqrst");
let b = await L.trovaOCrea("tok123", "Maria"); assert.equal(b.nuovo, false);
let s1 = await L.avanza("tok123", a.ref); assert.equal(s1.pronto, false);
let s2 = await L.avanza("tok123", a.ref); assert.equal(s2.pronto, false);
let s3 = await L.avanza("tok123", a.ref);
assert.equal(s3.pronto, true); assert.match(sqlEseguito, /create table if not exists stato/); assert.match(sqlEseguito, /enable row level security/);
assert.equal(s3.blocco, "NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijklmnopqrst.supabase.co\nSUPABASE_SERVICE_ROLE_KEY=SERVICE-KEY");
await assert.rejects(L.avanza("sbagliato", a.ref), e => e.status === 401);
assert.equal(L.messaggioAmico({ status: 401 }).riautorizza, true);
assert.match(L.messaggioAmico({ message: "You have reached the maximum limit of free projects" }).errore, /massimo di progetti/);
// regione in formato vecchio
progetti = []; regioneRifiutata = true;
let c = await L.trovaOCrea("tok123", "Luca"); assert.equal(c.nuovo, true);
console.log("OK: tutti i controlli superati");
srv.close();
