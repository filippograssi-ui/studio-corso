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
  const [indirizzo, setIndirizzo] = useState(sito ? new URL(sito).origin : "");
  const [copiato, setCopiato] = useState("");

  useEffect(() => { setGen(segretiGenerati()); }, []);

  const chiaveClaude = senzaSpazi(claude);
  const tokenWa = senzaSpazi(token);
  const id = soloCifre(idNumero);
  const num = soloCifre(numero);
  const segreto = senzaSpazi(appSecret);
  const usaWhatsApp = Boolean(tokenWa || id || num || segreto);

  const avvisi = [];
  if (chiaveClaude && !chiaveClaude.startsWith("sk-ant-")) avvisi.push("La chiave di Claude di solito inizia con «sk-ant-»: controlla di aver copiato quella giusta.");
  if (pass && !PASSWORD_OK.test(pass)) avvisi.push("La password deve avere da 8 a 64 caratteri: lettere, numeri e al massimo ! @ $ % ^ & * _ . + - (niente spazi).");
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
    if (usaWhatsApp && tokenWa && id && num && segreto) {
      r.push(["WHATSAPP_ACCESS_TOKEN", tokenWa], ["WHATSAPP_PHONE_NUMBER_ID", id], ["WHATSAPP_USER_NUMBER", num],
        ["WHATSAPP_APP_SECRET", segreto], ["WHATSAPP_VERIFY_TOKEN", gen.WHATSAPP_VERIFY_TOKEN],
        ["WHATSAPP_TEMPLATE_BRIEFING", "briefing_giornaliero"], ["CRON_SECRET", gen.CRON_SECRET]);
    }
    return r;
  }, [gen, chiaveClaude, pass, usaWhatsApp, tokenWa, id, num, segreto]);

  const blocco = righe.map(([k, v]) => `${k}=${v}`).join("\n");
  const indirizzoPulito = indirizzo.trim().replace(/\/+$/, "");
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
      <p>Qui prepari in un colpo solo le impostazioni per rendere il sito intelligente, protetto da password e collegato a WhatsApp. Compila solo le parti che vuoi attivare. <b>Quello che scrivi resta nel tuo browser:</b> Studio non lo riceve.</p>

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

      {avvisi.map((a, i) => <div className="avviso" key={i}>{a}</div>)}

      <h2 style={titolo}>4 · Incolla su Vercel</h2>
      {!righe.length ? <p style={piccolo}>Compila almeno una delle parti qui sopra: appare il blocco da copiare.</p> : (
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

      {usaWhatsApp && gen && (
        <>
          <h2 style={titolo}>5 · Dopo il Redeploy: dillo a Meta</h2>
          <p style={piccolo}>Su Meta: <b>WhatsApp → Configurazione</b> → <b>Webhook</b> → Modifica. Serve l&apos;indirizzo vero del tuo sito (su Vercel, nel progetto, in <b>Domains</b>: il primo, che finisce con .vercel.app).</p>
          <div style={campo}><input className="campo" placeholder="https://il-tuo-sito.vercel.app" value={indirizzo} onChange={e => setIndirizzo(e.target.value)} /></div>
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
