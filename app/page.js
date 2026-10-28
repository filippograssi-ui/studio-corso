"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { PannelloResto } from "./pannello-resto";

const SUGGERIMENTI = [
  "Cambia lo sfondo in un azzurro molto chiaro",
  "Rinomina la voce di menu \"Svago\" in \"Tempo libero\"",
  "Aggiungi la categoria di spesa \"Materiale didattico\"",
  "Aggiungi una sezione Verifiche per classe con data e stato",
];

let contatore = 0;
const nuovoId = () => ++contatore + "-" + Date.now();

export default function Pagina() {
  const [me, setMe] = useState(null);           // { codice, login, repo }
  const [repos, setRepos] = useState(null);
  const [errore, setErrore] = useState("");
  const [codice, setCodice] = useState("");
  const [msgs, setMsgs] = useFetchedMsgs();
  const [testo, setTesto] = useState("");
  const [occupato, setOccupato] = useState(false);
  const [sito, setSito] = useState(null);
  const [cronologia, setCronologia] = useState(null);
  const [resto, setResto] = useState(false);   // pannello «Collega il resto»
  const [db, setDb] = useState(null);           // pannello «Collega il database»
  const timerDb = useRef(null);
  const fondo = useRef(null);

  const carica = useCallback(async () => {
    try {
      const r = await fetch("/api/me");
      setMe(await r.json());
    } catch { setMe({ codice: false, login: null, repo: null }); }
  }, []);

  useEffect(() => {
    carica();
    const q = new URLSearchParams(window.location.search).get("errore");
    if (q === "accesso") setErrore("L'accesso con GitHub non è andato a buon fine. Riprova.");
    if (q === "non-ammesso") setErrore("Il tuo account GitHub non è nell'elenco del corso.");
    if (q === "supabase") setDb({ fase: "intro", errore: "Il collegamento con Supabase non è andato a buon fine. Riprova." });
    if (new URLSearchParams(window.location.search).get("db") === "1") { window.history.replaceState(null, "", "/"); avviaDatabase(); }
  }, [carica]);

  useEffect(() => {
    if (me?.login && !me.repo && !repos) {
      fetch("/api/repos").then(r => r.json()).then(d => setRepos(d.repository || [])).catch(() => setRepos([]));
    }
    if (me?.repo) {
      fetch("/api/status").then(r => r.json()).then(d => setSito(d.url || null)).catch(() => {});
    }
  }, [me, repos]);

  useEffect(() => { fondo.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs]);

  const aggiorna = (id, patch) => setMsgs(ms => ms.map(m => (m.id === id ? { ...m, ...(typeof patch === "function" ? patch(m) : patch) } : m)));

  async function inviaCodice(e) {
    e.preventDefault();
    setErrore("");
    const r = await fetch("/api/auth/code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ codice }) });
    const d = await r.json();
    if (!r.ok) return setErrore(d.errore || "Codice non corretto.");
    carica();
  }

  async function scegliRepo(nome) {
    await fetch("/api/repo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome }) });
    setRepos(null); setMsgs([]); setSito(null);
    carica();
  }

  async function esci() {
    await fetch("/api/auth/logout", { method: "POST" });
    setMsgs([]); setRepos(null);
    carica();
  }

  function segui(id, sha) {
    let giri = 0;
    const t = setInterval(async () => {
      giri++;
      try {
        const d = await (await fetch("/api/status?sha=" + sha)).json();
        // Vercel impiega qualche secondo a cominciare: per il primo minuto "nessuno" vuol dire "in attesa"
        aggiorna(id, { pub: d.stato === "nessuno" && giri < 15 ? { stato: "pending" } : d });
        if (d.url) setSito(d.url);
        if (["success", "failure", "error"].includes(d.stato) || giri > 60) clearInterval(t);
      } catch { if (giri > 60) clearInterval(t); }
    }, 4000);
  }

  async function invia(t) {
    const richiesta = (t ?? testo).trim();
    if (!richiesta || occupato) return;
    setTesto("");
    setOccupato(true);
    const storia = msgs.filter(m => !m.errore && !m.inCorso && m.testo).map(m => ({ role: m.ruolo === "tu" ? "user" : "assistant", content: m.testo }));
    const idTu = nuovoId(), idSt = nuovoId();
    setMsgs(ms => [...ms, { id: idTu, ruolo: "tu", testo: richiesta }, { id: idSt, ruolo: "studio", testo: "", inCorso: true, stato: "Mi preparo…", progressi: [] }]);
    try {
      const r = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ richiesta, storia }) });
      if (!r.ok || !r.body) {
        const d = await r.json().catch(() => ({}));
        aggiorna(idSt, { inCorso: false, errore: true, testo: d.errore || "Qualcosa non ha funzionato. Riprova." });
        if (r.status === 401) carica();
        return;
      }
      const lettore = r.body.getReader();
      const dec = new TextDecoder();
      let resto = "";
      for (;;) {
        const { value, done } = await lettore.read();
        if (done) break;
        resto += dec.decode(value, { stream: true });
        const righe = resto.split("\n");
        resto = righe.pop();
        for (const riga of righe) {
          if (!riga.trim()) continue;
          let ev; try { ev = JSON.parse(riga); } catch { continue; }
          if (ev.type === "stato") aggiorna(idSt, { stato: ev.testo });
          else if (ev.type === "strumento") aggiorna(idSt, m => ({ progressi: [...(m.progressi || []), ev.testo].slice(-6) }));
          else if (ev.type === "fine") {
            aggiorna(idSt, { inCorso: false, testo: ev.testo || (ev.sha ? "Fatto." : "Non ho cambiato nulla."), sha: ev.sha, files: ev.files, pub: ev.sha ? { stato: "pending" } : null });
            if (ev.sha) segui(idSt, ev.sha);
          } else if (ev.type === "errore") aggiorna(idSt, { inCorso: false, errore: true, testo: ev.testo });
        }
      }
      aggiorna(idSt, m => (m.inCorso ? { inCorso: false, errore: true, testo: "La connessione si è interrotta. Controlla la cronologia: la modifica potrebbe essere stata salvata." } : {}));
    } catch {
      aggiorna(idSt, { inCorso: false, errore: true, testo: "La connessione si è interrotta. Riprova tra un momento." });
    } finally {
      setOccupato(false);
    }
  }

  function avviaDatabase() {
    clearInterval(timerDb.current);
    setDb({ fase: "lavoro", testo: "Creo il tuo database su Supabase…" });
    (async () => {
      const r = await fetch("/api/supabase/crea", { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return setDb(d.riautorizza ? { fase: "intro", errore: d.errore } : { fase: "errore", testo: d.errore || "Qualcosa non ha funzionato." });
      let giri = 0;
      timerDb.current = setInterval(async () => {
        giri++;
        try {
          const s = await (await fetch("/api/supabase/stato?ref=" + d.ref)).json();
          if (s.errore) { clearInterval(timerDb.current); return setDb(s.riautorizza ? { fase: "intro", errore: s.errore } : { fase: "errore", testo: s.errore }); }
          if (s.pronto) { clearInterval(timerDb.current); return setDb({ fase: "fatto", blocco: s.blocco }); }
          setDb({ fase: "lavoro", testo: s.testo });
        } catch {}
        if (giri > 90) { clearInterval(timerDb.current); setDb({ fase: "errore", testo: "Ci sta mettendo troppo. Controlla su supabase.com che il progetto sia attivo, poi riprova." }); }
      }, 4000);
    })();
  }

  async function copiaBlocco(blocco) {
    try { await navigator.clipboard.writeText(blocco); setDb(x => ({ ...x, copiato: true })); }
    catch { document.getElementById("blocco-db")?.select(); }
  }

  async function annulla(id, sha) {
    if (!confirm("Annullare questa modifica? Il sito torna com'era prima.")) return;
    const r = await fetch("/api/undo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sha }) });
    const d = await r.json();
    if (!r.ok) return alert(d.errore || "Non sono riuscito ad annullare.");
    aggiorna(id, { annullata: true });
    const idN = nuovoId();
    setMsgs(ms => [...ms, { id: idN, ruolo: "studio", testo: "Fatto: ho annullato quella modifica. Il sito torna com'era tra circa un minuto.", pub: { stato: "pending" } }]);
    segui(idN, d.sha);
    setCronologia(null);
  }

  async function apriCronologia() {
    if (cronologia) return setCronologia(null);
    const d = await (await fetch("/api/history")).json();
    setCronologia(d.commit || []);
  }

  // ---------- schermate ----------
  if (!me) return <div className="pagina"><div className="scheda"><p>Carico…</p></div></div>;

  const testata = (
    <div className="testata">
      <div className="logo">Studio<span>.</span></div>
      <div className="destra">
        {me.login && <span>{me.login}{me.repo ? " · " + me.repo.split("/")[1] : ""}</span>}
        {me.repo && sito && <a className="btn" href={sito} target="_blank" rel="noopener">Apri il mio sito</a>}
        {me.repo && me.database && <button className="btn" onClick={() => setDb(db ? null : { fase: "intro" })}>Collega il database</button>}
        {me.repo && <button className="btn" onClick={() => setResto(x => !x)}>Collega il resto</button>}
        {me.repo && <button className="btn" onClick={apriCronologia}>Cronologia</button>}
        {me.repo && <button className="btn" onClick={() => scegliRepo(null)}>Cambia sito</button>}
        {me.login && <button className="btn" onClick={esci}>Esci</button>}
      </div>
    </div>
  );

  if (!me.codice) {
    return (
      <div className="pagina">{testata}
        <form className="scheda" onSubmit={inviaCodice}>
          <h1>Benvenuto in Studio</h1>
          <p>Qui scrivi cosa vuoi cambiare nel tuo assistente e Claude lo modifica per te. Per entrare serve il codice del corso.</p>
          <input className="campo" placeholder="Codice del corso" value={codice} onChange={e => setCodice(e.target.value)} autoFocus autoCapitalize="none" />
          <div style={{ marginTop: 12 }}><button className="btn primario" disabled={!codice.trim()}>Entra</button></div>
          {errore && <div className="errore">{errore}</div>}
        </form>
      </div>
    );
  }

  if (!me.login) {
    return (
      <div className="pagina">{testata}
        <div className="scheda">
          <h1>Collega il tuo GitHub</h1>
          <p>Studio deve poter scrivere nel repository del tuo assistente. Si apre GitHub, premi <b>Authorize</b> e torni qui. A fine corso puoi revocare l'accesso da GitHub → Settings → Applications.</p>
          <a className="btn primario" href="/api/auth/login">Entra con GitHub</a>
          {errore && <div className="errore">{errore}</div>}
        </div>
      </div>
    );
  }

  if (!me.repo) {
    return (
      <div className="pagina">{testata}
        <div className="scheda">
          <h1>Quale sito vuoi modificare?</h1>
          <p>Scegli il repository del tuo assistente (quello creato dal modello del corso).</p>
          {!repos ? <p>Cerco i tuoi repository…</p> : repos.length === 0 ? <p>Non trovo repository. Controlla di aver fatto l'accesso con l'account giusto.</p> : (
            <select className="campo" defaultValue="" onChange={e => e.target.value && scegliRepo(e.target.value)}>
              <option value="" disabled>Scegli…</option>
              {repos.map(r => <option key={r.nome} value={r.nome}>{r.nome}</option>)}
            </select>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="pagina">{testata}
      {resto && <PannelloResto sito={sito} onChiudi={() => setResto(false)} />}
      {db && (
        <div className="scheda" style={{ margin: "12px auto", maxWidth: 640 }}>
          <h1>Collega il tuo database</h1>
          {db.fase === "intro" && <>
            <p>Così le cose che inserisci nel sito (classi, orario, impegni) restano salvate. Studio crea per te un database gratuito su Supabase: si apre Supabase, premi <b>Authorize</b> e torni qui.</p>
            <p><b>Prima</b> di collegarlo: se vuoi che classi e orario siano già nel sito, scrivi in Studio «Aggiungi ai dati iniziali queste classi e questo orario…». Il database parte copiando quei dati.</p>
            <a className="btn primario" href="/api/supabase/login">Collega Supabase</a>
            {db.errore && <div className="errore">{db.errore}</div>}
          </>}
          {db.fase === "lavoro" && <p><span className="giro" />{db.testo}</p>}
          {db.fase === "errore" && <><div className="errore">{db.testo}</div><div style={{ marginTop: 12 }}><button className="btn" onClick={avviaDatabase}>Riprova</button></div></>}
          {db.fase === "fatto" && <>
            <p>Il database è pronto. Ultimo passo, su Vercel:</p>
            <ol>
              <li>Copia queste due righe: <button className="btn piccolo" onClick={() => copiaBlocco(db.blocco)}>{db.copiato ? "Copiato ✓" : "Copia"}</button></li>
              <li>Apri <a href="https://vercel.com/dashboard" target="_blank" rel="noopener">vercel.com</a> → il tuo progetto → <b>Settings</b> → <b>Environment Variables</b>.</li>
              <li>Clicca nel primo campo <b>Key</b> e incolla: le due variabili si compilano da sole. Premi <b>Save</b>.</li>
              <li>Vai in <b>Deployments</b> → i tre puntini dell'ultimo → <b>Redeploy</b>.</li>
            </ol>
            <textarea id="blocco-db" className="campo" readOnly rows={3} value={db.blocco} onFocus={e => e.target.select()} style={{ fontFamily: "monospace", fontSize: 12 }} />
            <p style={{ fontSize: 13, opacity: 0.8 }}>La seconda riga è una chiave segreta: non incollarla mai in una chat né in un messaggio, solo su Vercel.</p>
          </>}
        </div>
      )}
      {cronologia && (
        <div className="cronologia"><b>Ultime modifiche</b>
          {cronologia.map(c => (
            <div className="riga" key={c.sha}>
              <span>{c.messaggio.slice(0, 80)}</span>
              {c.messaggio.startsWith("Studio:") && !c.messaggio.includes("annullata") && <button className="btn piccolo rosso" onClick={() => annulla(null, c.sha)}>Annulla</button>}
            </div>
          ))}
          {!cronologia.length && <div className="vuoto">Ancora nessuna modifica.</div>}
        </div>
      )}
      <div className="chat">
        {!msgs.length && (
          <div className="scheda">
            <h1>Scrivi cosa vuoi cambiare</h1>
            <p>Parla come a una persona: “sfondo azzurro”, “aggiungi una scheda per le verifiche”, “nel menu chiamalo Tempo libero”. Una cosa alla volta, poi guardi il risultato sul tuo sito (si aggiorna in circa un minuto).</p>
            <div className="suggerimenti">{SUGGERIMENTI.map(s => <button key={s} onClick={() => invia(s)}>{s}</button>)}</div>
          </div>
        )}
        {msgs.map(m => (
          <div key={m.id} className={"msg " + m.ruolo + (m.errore ? " errore-msg" : "")} style={m.annullata ? { opacity: 0.55 } : undefined}>
            {m.inCorso ? <><span className="giro" />{m.stato}<div className="progressi">{(m.progressi || []).map((p, i) => <div key={i}>· {p}</div>)}</div></> : m.testo}
            {m.files?.length > 0 && <div className="progressi">File cambiati: {m.files.join(", ")}</div>}
            {m.pub && (
              <div className="pub">
                {m.pub.stato === "success" ? <span className="chip ok">Sito aggiornato</span>
                  : ["failure", "error"].includes(m.pub.stato) ? <span className="chip ko">La pubblicazione è fallita. Prova a scrivere: «sistema il sito» (oppure annulla la modifica)</span>
                  : m.pub.stato === "nessuno" ? <span className="chip neutro">Controlla su Vercel che il sito si stia aggiornando</span>
                  : <span className="chip att"><span className="giro" />Pubblicazione in corso…</span>}
                {m.pub.url && m.pub.stato === "success" && <a className="btn piccolo" href={m.pub.url} target="_blank" rel="noopener">Guarda</a>}
                {m.sha && !m.annullata && <button className="btn piccolo rosso" onClick={() => annulla(m.id, m.sha)}>Annulla questa modifica</button>}
              </div>
            )}
          </div>
        ))}
        <div ref={fondo} />
      </div>
      <div className="barra"><div className="barra-interna">
        <textarea rows={1} placeholder="Cosa vuoi cambiare?" value={testo} disabled={occupato}
          onChange={e => { setTesto(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(160, e.target.scrollHeight) + "px"; }}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); invia(); } }} />
        <button className="btn primario" disabled={occupato || !testo.trim()} onClick={() => invia()}>{occupato ? "…" : "Invia"}</button>
      </div></div>
    </div>
  );
}

// i messaggi restano se ricarichi la pagina (solo per questa scheda del browser)
function useFetchedMsgs() {
  const [msgs, setMsgs] = useState([]);
  useEffect(() => {
    try { const v = sessionStorage.getItem("studio-msgs"); if (v) setMsgs(JSON.parse(v).map(m => ({ ...m, inCorso: false, pub: m.pub && m.pub.stato === "pending" ? null : m.pub }))); } catch {}
  }, []);
  useEffect(() => {
    try { sessionStorage.setItem("studio-msgs", JSON.stringify(msgs.slice(-40).map(({ progressi, ...r }) => r))); } catch {}
  }, [msgs]);
  return [msgs, setMsgs];
}
