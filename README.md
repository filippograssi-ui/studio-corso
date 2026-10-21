# Studio — modifica il tuo assistente scrivendo a Claude

Studio è una pagina web per il corso "Costruisci il tuo assistente IA". Il partecipante entra con GitHub,
sceglie il repository del suo assistente e scrive cosa vuole cambiare ("sfondo azzurro", "aggiungi una scheda
Verifiche"). Claude legge i file, li modifica, controlla che non ci siano errori e salva tutto con un commit.
Vercel ripubblica il sito da solo in circa un minuto. Ogni modifica si può annullare con un clic.

## Come funziona

- `app/` — pagina (chat) e porte (`app/api/...`): accesso con codice del corso + GitHub, scelta del repository, chat in streaming, cronologia, annulla, stato della pubblicazione.
- `lib/agent.js` — l'agente: Claude con strumenti (cerca, leggi, modifica, scrivi, elimina) che lavorano su una copia in memoria del repository.
- `lib/check.js` — controllo prima del commit: sintassi dei file JS/JSON e import verso file inesistenti. Se trova errori li passa a Claude, che li corregge.
- `lib/github.js` — lettura del repository (un solo download), commit unico, annulla, stato dei deploy.
- `lib/session.js` — cookie cifrato con codice accettato, token GitHub e repository scelto. Nessun database.

## Sicurezza

- Per entrare serve il codice del corso (`STUDIO_CODE`); facoltativo l'elenco dei nomi GitHub ammessi (`STUDIO_ALLOWED_USERS`).
- Studio scrive solo nel repository scelto, solo dell'utente che ha fatto l'accesso. Non tocca `.env*`, `.github/`, `package-lock.json`.
- Non salva nulla fuori dal cookie di sessione. Il token resta nel cookie cifrato e viene usato solo per leggere e scrivere quel repository.
- Se una modifica rompe la build, Vercel tiene online l'ultima versione funzionante.

## Messa in funzione

Vedi `.env.example` per le variabili e la guida "Studio - messa in funzione" del corso.
Il controllo `/api/health` dice se le variabili ci sono (mai il loro valore).

## Collaudo senza GitHub vero

```
ANTHROPIC_API_KEY=... node scripts/test-finto.mjs <cartella-repo> "sfondo azzurro" "rinomina Svago in Tempo libero"
```
