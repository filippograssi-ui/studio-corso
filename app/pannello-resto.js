"use client";
// «Collega il resto»: password, intelligenza (chiave Claude) e WhatsApp.
// TUTTO avviene nel browser: i valori digitati non vengono mai inviati a Studio né salvati.
// Si ottiene un blocco di righe NOME=valore da incollare in Vercel (Environment Variables).
import { useEffect, useMemo, useState } from "react";

const CHIAVE_LOCALE = "studio-resto-segreti";

function casuale(byte) {
  const a = new Uint8Array(byte);
  crypto.getRandomValues(a);
  return [...a].map(b => b.toString(16).padStart(2, "0")).join("");
}

// I tre codici inventati da Studio (non sono segreti dell'utente) restano uguali se si riapre il pannello,
// altrimenti il codice di verifica incollato su Meta non coinciderebbe più con quello su Vercel.
function segretiGenerati() {
  try {
    const v = JSON.parse(localStorage.getItem(CHIAVE_LOCALE) || "null");
    if (v?.AUTH_SECRET && v?.CRON_SECRET && v?.WHATSAPP_VERIFY_TOKEN) return v;
  } catch {}
  const nuovi = { AUTH_SECRET: casuale(32), CRON_SECRET: casuale(24), WHATSAPP_VERIFY_TOKEN: casuale(10) };
  try { localStorage.setItem(CHIAVE_LOCALE, JSON.stringify(nuovi)); } catch {}
  return nuovi;
}

const CHIAVE_VAPID = "studio-resto-vapid";
const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

// Coppia di chiavi per le notifiche (VAPID, curva P-256): generata nel browser, uguale a ogni riapertura.
async function chiaviNotifiche() {
  try {
    const v = JSON.parse(localStorage.getItem(CHIAVE_VAPID) || "null");
    if (v?.pubblica && v?.privata) return v;
  } catch {}
  const coppia = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const pubblica = b64url(await crypto.subtle.exportKey("raw", coppia.publicKey));
  const privata = (await crypto.subtle.exportKey("jwk", coppia.privateKey)).d;
  const v = { pubblica, privata };
  try { localStorage.setItem(CHIAVE_VAPID, JSON.stringify(v)); } catch {}
  return v;
}

const senzaSpazi = s => String(s || "").replace(/\s+/g, "");
const soloCifre = s => String(s || "").replace(/\D+/g, "");
const PASSWORD_OK = /^[A-Za-z0-9!@$%^&*_.+-]{8,64}$/;

export function PannelloResto({ sito, onChiudi }) {
  const [gen, setGen] = useState(null);
  const [claude, setClaude] = useState("");
  const [pass, setPass] = useState("");
  const [token, setToken] = useState("");
  const [idNumero, setIdNumero] = useState("");
  const [numero, setNumero] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [gId, setGId] = useState("");
  const [gSegreto, setGSegreto] = useState("");
  const [indirizzo, setIndirizzo] = useState("");
  const [copiato, setCopiato] = useState("");
  const [notifiche, setNotifiche] = useState(false);
  const [vapid, setVapid] = useState(null);
  const [tel, setTel] = useState({ stato: "", testo: "" }); // stato: "" | "lavoro" | "ok" | "errore"

  useEffect(() => { setGen(segretiGenerati()); }, []);
  useEffect(() => { if (notifiche && !vapid) chiaviNotifiche().then(setVapid).catch(() => setNotifiche(false)); }, [notifiche, vapid]);

  async function aggiungiTelefono() {
    setTel({ stato: "lavoro", testo: "Aggiungo le funzioni al tuo sito…" });
    try {
      const r = await fetch("/api/funzioni/telefono", { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.errore || "Non sono riuscito ad aggiungerlo.");
      setTel({ stato: "ok", testo: d.gia ? "Il tuo sito ha già tutto: nessuna modifica necessaria." : `Fatto: ho aggiunto ${d.files.length} file al tuo sito. Si ripubblica da solo in circa un minuto.`, avvisi: d.avvisi || [] });
    } catch (e) {
      setTel({ stato: "errore", testo: e.message });
    }
  }

  const chiaveClaude = senzaSpazi(claude);
  const tokenWa = senzaSpazi(token);
  const id = soloCifre(idNumero);
  const num = soloCifre(numero);
  const segreto = senzaSpazi(appSecret);
  const googleId = senzaSpazi(gId);
  const googleSegreto = senzaSpazi(gSegreto);
  const usaGoogle = Boolean(googleId || googleSegreto);
  const usaWhatsApp = Boolean(tokenWa || id || num || segreto);

  const avvisi = [];
  if (chiaveClaude && !chiaveClaude.startsWith("sk-ant-")) avvisi.push("La chiave di Claude di solito inizia con «sk-ant-»: controlla di aver copiato quella giusta.");
  if (pass && !PASSWORD_OK.test(pass)) avvisi.push("La password deve avere da 8 a 64 caratteri: lettere, numeri e al massimo ! @ $ % ^ & * _ . + - (niente spazi).");
  if (usaGoogle) {
    if (googleId && !googleId.endsWith(".apps.googleusercontent.com")) avvisi.push("L'ID client di Google finisce con «.apps.googleusercontent.com»: controlla di aver copiato quello giusto.");
    if (!googleId || !googleSegreto) avvisi.push("Per Google Calendar servono sia l'ID client sia il segreto client.");
  }
  if (usaWhatsApp) {
    const mancano = [];
    if (!tokenWa) mancano.push("il token di accesso");
    if (!id) mancano.push("l'ID del numero di telefono");
    if (!num) mancano.push("il tuo numero");
    if (!segreto) mancano.push("la chiave segreta dell'app");
    if (mancano.length) avvisi.push("Per WhatsApp manca ancora: " + mancano.join(", ") + ".");
    if (numero && (num.startsWith("0") || num.length < 9)) avvisi.push("Il tuo numero va scritto con il prefisso del paese, senza + e senza zeri davanti (per l'Italia: 39 e poi il numero).");
  }

  const righe = useMemo(() => {
    if (!gen) return [];
    const r = [];
    if (chiaveClaude) r.push(["ANTHROPIC_API_KEY", chiaveClaude]);
    if (pass && PASSWORD_OK.test(pass)) { r.push(["DASHBOARD_PASSWORD", pass]); r.push(["AUTH_SECRET", gen.AUTH_SECRET]); }
    if (notifiche && vapid) r.push(["VAPID_PUBLIC_KEY", vapid.pubblica], ["VAPID_PRIVATE_KEY", vapid.privata]);
    if (usaGoogle && googleId && googleSegreto) r.push(["GOOGLE_CALENDAR_CLIENT_ID", googleId], ["GOOGLE_CALENDAR_CLIENT_SECRET", googleSegreto]);
    if (usaWhatsApp && tokenWa && id && num && segreto) {
      r.push(["WHATSAPP_ACCESS_TOKEN", tokenWa], ["WHATSAPP_PHONE_NUMBER_ID", id], ["WHATSAPP_USER_NUMBER", num],
        ["WHATSAPP_APP_SECRET", segreto], ["WHATSAPP_VERIFY_TOKEN", gen.WHATSAPP_VERIFY_TOKEN],
        ["WHATSAPP_TEMPLATE_BRIEFING", "briefing_giornaliero"], ["CRON_SECRET", gen.CRON_SECRET]);
    }
    return r;
  }, [gen, chiaveClaude, pass, notifiche, vapid, usaGoogle, googleId, googleSegreto, usaWhatsApp, tokenWa, id, num, segreto]);

  const blocco = righe.map(([k, v]) => `${k}=${v}`).join("\n");
  const indirizzoPulito = indirizzo.trim().replace(/\/+$/, "");
  const redirectGoogle = indirizzoPulito ? indirizzoPulito + "/api/google-calendar/callback" : "";
  const webhook = indirizzoPulito ? indirizzoPulito + "/api/whatsapp/webhook" : "";

  async function copia(nome, testo) {
    try { await navigator.clipboard.writeText(testo); setCopiato(nome); setTimeout(() => setCopiato(""), 2000); } catch {}
  }

  const campo = { marginBottom: 10 };
  const piccolo = { fontSize: 13, color: "var(--muted)", margin: "4px 0 8px" };
  const titolo = { fontSize: 16, margin: "22px 0 6px" };

  return (
    <div className="scheda" style={{ margin: "12px auto", maxWidth: 680 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <h1>Collega il resto</h1>
        <button className="btn piccolo" onClick={onChiudi}>Chiudi</button>
      </div>
      <p>Qui prepari in un colpo solo le impostazioni per rendere il sito intelligente, protetto da password, collegato a WhatsApp e installabile sul telefono. Compila solo le parti che vuoi attivare. <b>Quello che scrivi resta nel tuo browser:</b> Studio non lo riceve.</p>

      <h2 style={titolo}>0 · L&apos;indirizzo del tuo sito</h2>
      <p style={piccolo}>Su Vercel, nel tuo progetto, apri <b>Domains</b>: copia il primo indirizzo (finisce con .vercel.app). Serve per Google Calendar e per WhatsApp.</p>
      <div style={campo}><input className="campo" placeholder="https://il-tuo-sito.vercel.app" value={indirizzo} onChange={e => setIndirizzo(e.target.value)} /></div>

      <h2 style={titolo}>1 · L&apos;intelligenza (Claude)</h2>
      <p style={piccolo}>Serve a riassunto del giorno, barra di cattura e a capire i messaggi di WhatsApp. Vai su <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com</a> → <b>API Keys</b> → <b>Create Key</b> e copia la chiave. Se non hai crediti, in <b>Billing</b> aggiungi un piccolo credito (qualche dollaro bastano) e imposta un tetto di spesa mensile.</p>
      <div style={campo}><input className="campo" type="password" autoComplete="off" placeholder="Chiave di Claude (sk-ant-…)" value={claude} onChange={e => setClaude(e.target.value)} /></div>

      <h2 style={titolo}>2 · La password d&apos;ingresso</h2>
      <p style={piccolo}>Chi trova il link del tuo sito non potrà vedere i tuoi dati senza questa password. Scegline una che ricordi (la scrivi solo qui e su Vercel).</p>
      <div style={campo}><input className="campo" type="password" autoComplete="new-password" placeholder="Password del sito" value={pass} onChange={e => setPass(e.target.value)} /></div>

      <h2 style={titolo}>3 · WhatsApp</h2>
      <p style={piccolo}>Sulla pagina Meta del tuo progetto (<b>WhatsApp → Configurazione API</b>) trovi il token e l&apos;ID del numero. La chiave segreta è in <b>Impostazioni dell&apos;app → Di base → Chiave segreta dell&apos;app</b> (premi Mostra). Sono le impostazioni più delicate: non incollarle altrove.</p>
      <div style={campo}><input className="campo" type="password" autoComplete="off" placeholder="Token di accesso (EAA…)" value={token} onChange={e => setToken(e.target.value)} /></div>
      <div style={campo}><input className="campo" inputMode="numeric" autoComplete="off" placeholder="ID del numero di telefono (solo cifre)" value={idNumero} onChange={e => setIdNumero(e.target.value)} /></div>
      <div style={campo}><input className="campo" inputMode="numeric" autoComplete="off" placeholder="Il tuo numero, con prefisso: 39 e poi il numero" value={numero} onChange={e => setNumero(e.target.value)} /></div>
      <div style={campo}><input className="campo" type="password" autoComplete="off" placeholder="Chiave segreta dell'app" value={appSecret} onChange={e => setAppSecret(e.target.value)} /></div>
      <p style={piccolo}>Il token che Meta mostra subito vale solo <b>24 ore</b>: va bene per la prova di oggi. Per averne uno permanente si segue la scheda dedicata.</p>

      <h2 style={titolo}>4 · Google Calendar</h2>
      <p style={piccolo}>Il sito mostra gli impegni del tuo Google Calendar e può aggiungerne. Servono le credenziali di Google, che crei tu gratis (circa 10 minuti). I nomi dei menu di Google cambiano spesso: se non trovi una voce, cercala con il testo.</p>
      <ol style={{ color: "var(--muted)", fontSize: 14, paddingLeft: 20, margin: "0 0 10px" }}>
        <li>Vai su <a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noopener">console.cloud.google.com</a> e crea un progetto (nome: «assistente»).</li>
        <li>Apri <a href="https://console.cloud.google.com/apis/library/calendar-json.googleapis.com" target="_blank" rel="noopener">Google Calendar API</a> e premi <b>Abilita</b>.</li>
        <li>In <b>Google Auth Platform</b> (o «Schermata consenso OAuth») scegli <b>Inizia</b>: nome app «assistente», la tua email, pubblico <b>Esterno</b>. Poi in <b>Pubblico</b> aggiungi la tua email tra gli <b>Utenti di prova</b>.</li>
        <li>In <b>Client</b> (o «Credenziali») premi <b>Crea client</b> → tipo <b>Applicazione web</b> → in <b>URI di reindirizzamento autorizzati</b> incolla questo indirizzo: {redirectGoogle ? <><code style={{ wordBreak: "break-all" }}>{redirectGoogle}</code> <button className="btn piccolo" onClick={() => copia("g", redirectGoogle)}>{copiato === "g" ? "Copiato ✓" : "Copia"}</button></> : <i>(prima scrivi l&apos;indirizzo del sito qui sopra)</i>}</li>
        <li>Premi <b>Crea</b>: Google mostra <b>ID client</b> e <b>Segreto client</b>. Incollali qui sotto.</li>
      </ol>
      <div style={campo}><input className="campo" autoComplete="off" placeholder="ID client (finisce con .apps.googleusercontent.com)" value={gId} onChange={e => setGId(e.target.value)} /></div>
      <div style={campo}><input className="campo" type="password" autoComplete="off" placeholder="Segreto client (inizia con GOCSPX-)" value={gSegreto} onChange={e => setGSegreto(e.target.value)} /></div>
      <p style={piccolo}>Finché l&apos;app Google è in prova, il collegamento vale 7 giorni e poi va rifatto (si preme di nuovo il pulsante nel sito). Chi vuole che duri, in <b>Pubblico</b> preme <b>Pubblica app</b>: per uso personale va bene anche senza la verifica di Google.</p>

      {avvisi.map((a, i) => <div className="avviso" key={i}>{a}</div>)}

      <h2 style={titolo}>5 · Sul telefono e notifiche</h2>
      <p style={piccolo}>Il tuo sito diventa un&apos;app: un&apos;icona nella schermata Home, che si apre a tutto schermo, e (se vuoi) notifiche, per esempio il riassunto del mattino. Premi il pulsante: Studio aggiunge i file al tuo sito.</p>
      <div style={campo}>
        <button className="btn primario" disabled={tel.stato === "lavoro"} onClick={aggiungiTelefono}>{tel.stato === "lavoro" ? "Un attimo…" : "Aggiungi al mio sito"}</button>
      </div>
      {tel.testo && <div className={tel.stato === "errore" ? "avviso" : "avviso ok"} style={{ marginBottom: 10 }}>{tel.testo}</div>}
      {tel.avvisi?.map((a, i) => <div className="avviso" key={i}>{a}</div>)}
      <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 14, margin: "8px 0" }}>
        <input type="checkbox" checked={notifiche} onChange={e => setNotifiche(e.target.checked)} style={{ marginTop: 3 }} />
        <span>Voglio anche le <b>notifiche</b> (serve un codice in più nel blocco qui sotto: lo preparo io).</span>
      </label>
      <ol style={{ color: "var(--muted)", fontSize: 14, paddingLeft: 20, margin: "0 0 10px" }}>
        <li>Premi <b>Aggiungi al mio sito</b> e aspetta circa un minuto.</li>
        {notifiche && <li>Incolla su Vercel il blocco del punto 6 e fai il <b>Redeploy</b> (le notifiche funzionano solo dopo).</li>}
        <li><b>iPhone o iPad:</b> apri il tuo sito con <b>Safari</b> → tasto <b>Condividi</b> → <b>Aggiungi alla schermata Home</b> → Aggiungi. Poi apri l&apos;app dalla nuova icona. (Serve iOS 16.4 o più recente; le notifiche funzionano <i>solo</i> aprendo l&apos;app dall&apos;icona.)</li>
        <li><b>Android:</b> apri il sito con Chrome → menu (tre puntini) → <b>Installa app</b> (o «Aggiungi a schermata Home»).</li>
        {notifiche && <li>Aperta l&apos;app, tocca la campanella in alto a destra → <b>Attiva le notifiche</b> → consenti → <b>Prova</b>: ti arriva una notifica.</li>}
      </ol>

      <h2 style={titolo}>6 · Incolla su Vercel</h2>
      {!righe.length ? <p style={piccolo}>Compila almeno una delle parti qui sopra (o spunta le notifiche): appare il blocco da copiare.</p> : (
        <>
          <textarea className="campo" readOnly rows={Math.min(14, righe.length + 1)} value={blocco} onFocus={e => e.target.select()} style={{ fontFamily: "monospace", fontSize: 12 }} />
          <div style={{ margin: "8px 0 4px" }}><button className="btn primario" onClick={() => copia("blocco", blocco)}>{copiato === "blocco" ? "Copiato ✓" : "Copia le impostazioni"}</button></div>
          <ol style={{ color: "var(--muted)", fontSize: 14, paddingLeft: 20 }}>
            <li>Apri <a href="https://vercel.com/dashboard" target="_blank" rel="noopener">vercel.com</a> → il tuo progetto → <b>Settings</b> → <b>Environment Variables</b>.</li>
            <li>Clicca nel primo campo <b>Key</b> e incolla: le righe si dividono da sole. Premi <b>Save</b>. (Se Vercel dice che una variabile esiste già, aprila e cambia il valore.)</li>
            <li>Vai in <b>Deployments</b> → i tre puntini dell&apos;ultimo → <b>Redeploy</b>, e aspetta che finisca.</li>
          </ol>
          <p style={piccolo}>Contiene chiavi segrete: non incollarlo in una chat né in un messaggio, solo su Vercel.</p>
        </>
      )}

      {usaGoogle && (
        <p style={{ ...piccolo, marginTop: 14 }}><b>Dopo il Redeploy:</b> apri il tuo sito, nella scheda Calendario premi <b>Connetti Google Calendar</b>, scegli il tuo account e consenti. Se Google dice «app non verificata», premi <b>Avanzate</b> → <b>Vai a assistente</b>.</p>
      )}

      {usaWhatsApp && gen && (
        <>
          <h2 style={titolo}>7 · Dopo il Redeploy: dillo a Meta</h2>
          <p style={piccolo}>Su Meta: <b>WhatsApp → Configurazione</b> → <b>Webhook</b> → Modifica. L&apos;indirizzo è quello del tuo sito, scritto in alto.</p>
          {webhook && (
            <div style={{ fontSize: 14 }}>
              <div style={campo}><b>URL di callback</b><br /><code style={{ wordBreak: "break-all" }}>{webhook}</code> <button className="btn piccolo" onClick={() => copia("url", webhook)}>{copiato === "url" ? "Copiato ✓" : "Copia"}</button></div>
              <div style={campo}><b>Token di verifica</b><br /><code>{gen.WHATSAPP_VERIFY_TOKEN}</code> <button className="btn piccolo" onClick={() => copia("tok", gen.WHATSAPP_VERIFY_TOKEN)}>{copiato === "tok" ? "Copiato ✓" : "Copia"}</button></div>
            </div>
          )}
          <ol style={{ color: "var(--muted)", fontSize: 14, paddingLeft: 20 }}>
            <li>Incolla i due valori e premi <b>Verifica e salva</b>.</li>
            <li>Nella stessa pagina, sotto <b>Campi del webhook</b>, iscriviti a <b>messages</b>.</li>
            <li>Prova: dal tuo telefono scrivi al numero di prova «ricordami di stampare le verifiche per giovedì». La voce deve comparire in «Da fare».</li>
          </ol>
        </>
      )}
    </div>
  );
}
