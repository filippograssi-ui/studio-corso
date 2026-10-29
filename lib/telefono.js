// «Sul telefono e notifiche»: aggiunge al sito di un partecipante (modello del corso) tutto quello che serve per
//  - installarlo sul telefono (icona nella schermata Home, apre a schermo intero)
//  - ricevere notifiche push (prova, riassunto del mattino)
// Funzione deterministica: niente Claude. Lavora su una Map percorso -> testo e restituisce solo i file da cambiare.
import zlib from "node:zlib";

// ---------------------------------------------------------------- icone PNG (senza librerie)
const TAB = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = TAB[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(tipo, dati) {
  const len = Buffer.alloc(4); len.writeUInt32BE(dati.length);
  const corpo = Buffer.concat([Buffer.from(tipo), dati]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(corpo));
  return Buffer.concat([len, corpo, crc]);
}
function distSegmento(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
export function coloreRgb(hex, def = [47, 111, 237]) {
  let h = String(hex || "").replace("#", "");
  if (h.length === 3) h = h.split("").map(c => c + c).join("");
  if (!/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(h)) return def;
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
}
// Quadrato colorato (angoli arrotondati se "tondo") con un segno di spunta bianco: l'assistente "ha fatto".
export function iconaPng(dim, rgb, tondo = true) {
  const S = 3; // supercampionamento per bordi morbidi
  const raggio = tondo ? dim * 0.22 : 0;
  const luce = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
  const segno = luce > 0.75 ? [27, 31, 36] : [255, 255, 255];
  const seg = [[0.27, 0.52, 0.43, 0.67], [0.43, 0.67, 0.74, 0.34]].map(s => s.map(v => v * dim));
  const sp = dim * 0.045; // metà spessore
  const righe = [];
  for (let y = 0; y < dim; y++) {
    const riga = Buffer.alloc(1 + dim * 4);
    for (let x = 0; x < dim; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
        const px = x + (sx + 0.5) / S, py = y + (sy + 0.5) / S;
        // dentro il quadrato arrotondato?
        const cx = Math.min(Math.max(px, raggio), dim - raggio), cy = Math.min(Math.max(py, raggio), dim - raggio);
        if (Math.hypot(px - cx, py - cy) > raggio + 1e-9) continue;
        const sopra = seg.some(([ax, ay, bx, by]) => distSegmento(px, py, ax, ay, bx, by) <= sp);
        const c = sopra ? segno : rgb;
        r += c[0]; g += c[1]; b += c[2]; a += 255;
      }
      const n = S * S, o = 1 + x * 4;
      if (a) { riga[o] = Math.round(r / (a / 255)); riga[o + 1] = Math.round(g / (a / 255)); riga[o + 2] = Math.round(b / (a / 255)); riga[o + 3] = Math.round(a / n); }
    }
    righe.push(riga);
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(dim, 0); ihdr.writeUInt32BE(dim, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(Buffer.concat(righe))), chunk("IEND", Buffer.alloc(0))]);
}

// ---------------------------------------------------------------- file da aggiungere
const MANIFEST = (nome, breve, tema, sfondo) => `// Fa installare il sito come app sul telefono (icona nella schermata Home).
export default function manifest() {
  return {
    name: ${JSON.stringify(nome)},
    short_name: ${JSON.stringify(breve)},
    description: "Il mio assistente personale",
    start_url: "/",
    display: "standalone",
    background_color: ${JSON.stringify(sfondo)},
    theme_color: ${JSON.stringify(tema)},
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
`;

const SW = `// Service worker: serve a ricevere le notifiche anche a sito chiuso.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {}); // nessuna cache: i dati restano sempre aggiornati

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { testo: e.data ? e.data.text() : "" }; }
  e.waitUntil(
    self.registration.showNotification(d.titolo || "Il mio assistente", {
      body: d.testo || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: d.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((lista) => {
      for (const c of lista) if ("focus" in c) { if (c.navigate) c.navigate(url); return c.focus(); }
      return self.clients.openWindow(url);
    })
  );
});
`;

const LIB_PUSH = `// Notifiche push (Web Push): le iscrizioni dei telefoni stanno in state.push.
import webpush from "web-push";
import { readState, updateState } from "./store.js";

export function pushConfigurato() {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

function soggetto() {
  if (process.env.VAPID_SUBJECT) return process.env.VAPID_SUBJECT;
  const dominio = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return dominio ? "https://" + dominio : "mailto:assistente@example.com";
}

export async function inviaPush({ titolo, testo, url = "/" }) {
  if (!pushConfigurato()) return { inviate: 0, scadute: 0, motivo: "Mancano VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY su Vercel." };
  webpush.setVapidDetails(soggetto(), process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  const stato = await readState();
  const iscrizioni = stato.push || [];
  let inviate = 0;
  const scadute = [];
  let ultimoErrore = null;
  await Promise.all(
    iscrizioni.map(async (s) => {
      try {
        await webpush.sendNotification(s, JSON.stringify({ titolo, testo, url }));
        inviate++;
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) scadute.push(s.endpoint);
        else ultimoErrore = e.message;
      }
    })
  );
  if (scadute.length) {
    await updateState((st) => {
      st.push = (st.push || []).filter((x) => !scadute.includes(x.endpoint));
      return st;
    });
  }
  return { inviate, scadute: scadute.length, ...(ultimoErrore ? { errore: ultimoErrore } : {}) };
}
`;

const ROUTE_CHIAVE = `import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// La chiave PUBBLICA serve al telefono per iscriversi alle notifiche.
export async function GET() {
  return NextResponse.json({ chiave: process.env.VAPID_PUBLIC_KEY || null });
}
`;

const ROUTE_ISCRIZIONE = `import { NextResponse } from "next/server";
import { updateState } from "@/lib/store";

export const dynamic = "force-dynamic";

function valida(s) {
  return s && typeof s.endpoint === "string" && /^https:\\/\\//.test(s.endpoint) && s.endpoint.length < 1000
    && s.keys && typeof s.keys.p256dh === "string" && typeof s.keys.auth === "string";
}

// Un telefono si iscrive alle notifiche.
export async function POST(request) {
  const s = await request.json().catch(() => null);
  if (!valida(s)) return NextResponse.json({ error: "Iscrizione non valida" }, { status: 400 });
  await updateState((st) => {
    const altre = (st.push || []).filter((x) => x.endpoint !== s.endpoint);
    st.push = [...altre, { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth }, aggiunto: new Date().toISOString() }].slice(-10);
    return st;
  });
  return NextResponse.json({ ok: true });
}

// Un telefono si disiscrive.
export async function DELETE(request) {
  const s = await request.json().catch(() => null);
  if (!s || typeof s.endpoint !== "string") return NextResponse.json({ error: "Richiesta non valida" }, { status: 400 });
  await updateState((st) => {
    st.push = (st.push || []).filter((x) => x.endpoint !== s.endpoint);
    return st;
  });
  return NextResponse.json({ ok: true });
}
`;

const ROUTE_PROVA = `import { NextResponse } from "next/server";
import { inviaPush } from "@/lib/push";

export const dynamic = "force-dynamic";

// Pulsante «Prova una notifica» del sito.
export async function POST() {
  const r = await inviaPush({ titolo: "Prova riuscita", testo: "Le notifiche del tuo assistente funzionano." });
  return NextResponse.json(r);
}
`;

const ROUTE_CRON = `import { NextResponse } from "next/server";
import { readState } from "@/lib/store";
import { inviaPush } from "@/lib/push";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Chiamata da Vercel ogni mattina (vedi vercel.json), un'ora dopo il briefing di WhatsApp:
// manda in notifica l'inizio del riassunto della giornata.
export async function GET(request) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== \`Bearer \${process.env.CRON_SECRET}\`) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }
  const stato = await readState();
  const agg = stato.aggiornamenti;
  const oggi = new Date().toISOString().slice(0, 10);
  const fresco = agg?.testo && String(agg.generatoIl || "").slice(0, 10) === oggi;
  const testo = fresco ? String(agg.testo).replace(/\\s+/g, " ").trim().slice(0, 170) : "Apri il tuo assistente: la giornata ti aspetta.";
  return NextResponse.json(await inviaPush({ titolo: "Buongiorno", testo }));
}
`;

const COMPONENTE = `"use client";

import { useEffect, useState } from "react";

// Pulsante in alto a destra: installare il sito sul telefono e attivare le notifiche.
function chiaveInBytes(b64) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export default function InstallaApp() {
  const [aperto, setAperto] = useState(false);
  const [pronto, setPronto] = useState(false);
  const [ios, setIos] = useState(false);
  const [installata, setInstallata] = useState(false);
  const [supportoPush, setSupportoPush] = useState(false);
  const [iscritto, setIscritto] = useState(false);
  const [prompt, setPrompt] = useState(null);
  const [msg, setMsg] = useState("");
  const [occupato, setOccupato] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent || "";
    setIos(/iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
    setInstallata(window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true);
    const push = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setSupportoPush(push);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").then(async (reg) => {
        if (push) setIscritto(Boolean(await reg.pushManager.getSubscription()));
      }).catch(() => {});
    }
    const prima = (e) => { e.preventDefault(); setPrompt(e); };
    window.addEventListener("beforeinstallprompt", prima);
    window.addEventListener("appinstalled", () => setInstallata(true));
    setPronto(true);
    return () => window.removeEventListener("beforeinstallprompt", prima);
  }, []);

  async function installa() {
    if (!prompt) return;
    prompt.prompt();
    await prompt.userChoice.catch(() => {});
    setPrompt(null);
  }

  async function attiva() {
    setOccupato(true); setMsg("");
    try {
      const permesso = await Notification.requestPermission();
      if (permesso !== "granted") { setMsg("Le notifiche non sono permesse: attivale dalle impostazioni del telefono per questo sito."); return; }
      const { chiave } = await (await fetch("/api/push/chiave")).json();
      if (!chiave) { setMsg("Le notifiche non sono ancora configurate su Vercel (mancano le chiavi VAPID). Usa il pannello «Collega il resto» di Studio."); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chiaveInBytes(chiave) }));
      const r = await fetch("/api/push/iscrizione", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
      if (!r.ok) throw new Error("salvataggio");
      setIscritto(true); setMsg("Notifiche attivate su questo telefono.");
    } catch (e) {
      setMsg("Non sono riuscito ad attivare le notifiche. Se hai appena cambiato le chiavi su Vercel, fai Redeploy e riprova.");
    } finally { setOccupato(false); }
  }

  async function disattiva() {
    setOccupato(true); setMsg("");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/iscrizione", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
      setIscritto(false); setMsg("Notifiche disattivate.");
    } catch { setMsg("Non sono riuscito a disattivarle."); } finally { setOccupato(false); }
  }

  async function prova() {
    setOccupato(true); setMsg("");
    try {
      const r = await (await fetch("/api/push/prova", { method: "POST" })).json();
      setMsg(r.inviate > 0 ? "Notifica inviata: dovrebbe arrivare tra un attimo." : r.motivo || r.errore || "Nessun telefono iscritto: attiva prima le notifiche.");
    } catch { setMsg("Prova non riuscita."); } finally { setOccupato(false); }
  }

  if (!pronto) return null;
  const tuttoFatto = installata && iscritto;
  const stile = { background: "var(--surface, #fff)", color: "var(--text, #1b1f24)", border: "1px solid var(--border, #e3e6ea)", borderRadius: 14, boxShadow: "0 6px 24px rgba(16,24,40,.18)" };
  const bottone = { border: "1px solid var(--border, #e3e6ea)", background: "var(--surface, #fff)", color: "inherit", borderRadius: 999, padding: "7px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer" };
  const primario = { ...bottone, background: "var(--accent, #2f6fed)", borderColor: "var(--accent, #2f6fed)", color: "#fff" };

  return (
    <div style={{ position: "fixed", top: 10, right: 10, zIndex: 60, fontSize: 14 }}>
      <button aria-label="Telefono e notifiche" title="Telefono e notifiche" onClick={() => setAperto((a) => !a)}
        style={{ ...stile, width: 38, height: 38, padding: 0, cursor: "pointer", opacity: tuttoFatto ? 0.55 : 1, display: "grid", placeItems: "center" }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
      </button>
      {aperto && (
        <div style={{ ...stile, position: "absolute", top: 46, right: 0, width: 300, padding: 14, lineHeight: 1.4 }}>
          <b>Sul telefono</b>
          <p style={{ margin: "8px 0 4px" }}><b>1. L&apos;icona nella Home</b></p>
          {installata ? <p style={{ margin: 0, opacity: 0.8 }}>Già installato: stai usando l&apos;app.</p>
            : ios ? <p style={{ margin: 0, opacity: 0.85 }}>Su iPhone/iPad apri questo sito con <b>Safari</b>, premi il tasto <b>Condividi</b> (il quadrato con la freccia) e scegli <b>Aggiungi alla schermata Home</b>. Poi aprilo dall&apos;icona.</p>
            : prompt ? <button style={primario} onClick={installa}>Installa l&apos;app</button>
            : <p style={{ margin: 0, opacity: 0.85 }}>Su Android apri il menu di Chrome (tre puntini) e scegli <b>Installa app</b> (o <b>Aggiungi a schermata Home</b>).</p>}
          <p style={{ margin: "12px 0 4px" }}><b>2. Le notifiche</b></p>
          {!supportoPush ? <p style={{ margin: 0, opacity: 0.85 }}>{ios && !installata ? "Su iPhone le notifiche funzionano solo dopo aver aggiunto il sito alla schermata Home e averlo aperto da lì." : "Questo browser non supporta le notifiche."}</p>
            : iscritto ? (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button style={primario} disabled={occupato} onClick={prova}>Prova una notifica</button>
                <button style={bottone} disabled={occupato} onClick={disattiva}>Disattiva</button>
              </div>
            ) : <button style={primario} disabled={occupato} onClick={attiva}>Attiva le notifiche</button>}
          {msg && <p style={{ margin: "10px 0 0", fontSize: 13, opacity: 0.9 }}>{msg}</p>}
        </div>
      )}
    </div>
  );
}
`;

// ---------------------------------------------------------------- applicazione
const esiste = (files, p) => files.has(p);
// files: Map percorso -> stringa | Buffer | { testo } (formato di leggiTarGz)
const testo = (files, p) => {
  const v = files.get(p);
  if (v == null) return null;
  if (typeof v === "string") return v;
  if (Buffer.isBuffer(v)) return v.toString("utf8");
  return typeof v.testo === "string" ? v.testo : null;
};

export function applicaTelefono(files) {
  const cambi = new Map();
  const note = [];
  const avvisi = [];

  const css = testo(files, "app/globals.css") || "";
  const accento = (/--accent:\s*(#[0-9a-fA-F]{3,8})/.exec(css) || [])[1] || "#2f6fed";
  const sfondo = (/--bg:\s*(#[0-9a-fA-F]{3,8})/.exec(css) || [])[1] || "#f4f5f7";
  const layout = testo(files, "app/layout.js");
  const titolo = (layout && /title:\s*"([^"]{1,60})"/.exec(layout)?.[1]) || "Il mio assistente";
  const parole = titolo.split(/\s+/);
  const breve = titolo.length <= 12 ? titolo : (parole.at(-1).length >= 5 && parole.at(-1).length <= 12 ? parole.at(-1) : titolo.slice(0, 12).trim());
  const breveMaiuscola = breve.charAt(0).toUpperCase() + breve.slice(1);
  const rgb = coloreRgb(accento);

  // file nuovi (sempre riscritti: così un secondo clic aggiorna senza rompere nulla)
  cambi.set("app/manifest.js", MANIFEST(titolo, breveMaiuscola, accento, sfondo));
  cambi.set("public/sw.js", SW);
  cambi.set("public/icon-192.png", iconaPng(192, rgb));
  cambi.set("public/icon-512.png", iconaPng(512, rgb));
  cambi.set("app/apple-icon.png", iconaPng(180, rgb, false));
  cambi.set("components/InstallaApp.js", COMPONENTE);
  cambi.set("lib/push.js", LIB_PUSH);
  cambi.set("app/api/push/chiave/route.js", ROUTE_CHIAVE);
  cambi.set("app/api/push/iscrizione/route.js", ROUTE_ISCRIZIONE);
  cambi.set("app/api/push/prova/route.js", ROUTE_PROVA);
  cambi.set("app/api/cron/notifica/route.js", ROUTE_CRON);

  // layout: aggancia il pulsante
  if (layout == null) avvisi.push("Non trovo app/layout.js: il pulsante non è stato agganciato.");
  else if (!layout.includes("InstallaApp")) {
    let nuovo = layout;
    const imp = [...nuovo.matchAll(/^import .*$/gm)];
    const riga = 'import InstallaApp from "@/components/InstallaApp";';
    if (imp.length) { const u = imp[imp.length - 1]; nuovo = nuovo.slice(0, u.index + u[0].length) + "\n" + riga + nuovo.slice(u.index + u[0].length); }
    else nuovo = riga + "\n" + nuovo;
    if (/<\/body>/.test(nuovo)) { nuovo = nuovo.replace(/(\s*)<\/body>/, "$1  <InstallaApp />$1</body>"); cambi.set("app/layout.js", nuovo); }
    else avvisi.push("Nel layout non trovo </body>: il pulsante non è stato agganciato.");
  }

  // dipendenza web-push
  const pj = testo(files, "package.json");
  if (pj) {
    try {
      const j = JSON.parse(pj);
      if (!j.dependencies?.["web-push"]) {
        j.dependencies = { ...(j.dependencies || {}), "web-push": "^3.6.7" };
        j.dependencies = Object.fromEntries(Object.entries(j.dependencies).sort(([a], [b]) => a.localeCompare(b)));
        cambi.set("package.json", JSON.stringify(j, null, 2) + "\n");
      }
    } catch { avvisi.push("package.json non è leggibile: manca la dipendenza web-push."); }
  } else avvisi.push("Non trovo package.json.");

  // cron del mattino: un'ora dopo il briefing
  let vj = {};
  try { vj = testo(files, "vercel.json") ? JSON.parse(testo(files, "vercel.json")) : {}; } catch { vj = null; avvisi.push("vercel.json non è leggibile: la notifica del mattino non è stata programmata."); }
  if (vj) {
    const crons = Array.isArray(vj.crons) ? vj.crons : [];
    if (!crons.some(c => c.path === "/api/cron/notifica")) {
      vj.crons = [...crons, { path: "/api/cron/notifica", schedule: "0 6 * * *" }];
      cambi.set("vercel.json", JSON.stringify(vj, null, 2) + "\n");
    }
  }

  // il lucchetto con password non deve bloccare manifest, icone e service worker (il browser li chiede senza cookie)
  const px = testo(files, "proxy.js");
  if (px && /const PREFISSI_ESCLUSI = \[/.test(px) && !px.includes("/manifest.webmanifest")) {
    cambi.set("proxy.js", px.replace(/const PREFISSI_ESCLUSI = \[/, 'const PREFISSI_ESCLUSI = ["/manifest.webmanifest", "/sw.js", "/icon-", "/apple-icon", '));
  } else if (px && !px.includes("/manifest.webmanifest")) avvisi.push("Non riesco ad aggiornare proxy.js: se hai la password, l'installazione sul telefono potrebbe non funzionare.");

  // togli i file già identici
  for (const [p, v] of [...cambi]) {
    const att = testo(files, p);
    if (att != null && typeof v === "string" && att === v) cambi.delete(p);
  }
  return { cambi, avvisi, accento, titolo };
}
