# dashboard

Vite + React 19 + React Router 7, con `@italia-tailwind/css` (classi `ita-*`) e `@simple-table/react` per le tabelle. Parla con l'API v2 attraverso il proxy di Vite (`/v2` → `API_PROXY_TARGET`, default `http://localhost:3001`): dashboard e API stanno sullo stesso sito, come serve al cookie di sessione `SameSite=Lax`.

```sh
bun run dev:api          # dalla radice
bun run dev:dashboard    # http://localhost:5173
```

## Area pubblica

| Percorso | |
|---|---|
| `/` | **Onboarding delle PA** (flusso standard): ricerca dell'ente nell'anagrafica IndicePA (`bun run ipa:sync`), scelta di una sua PEC, referente, URL dell'organizzazione di code hosting. La richiesta resta `PENDING` finché l'ente non la conferma dal link inviato alla PEC |
| `/onboarding/conferma?token=…` | Aperta dal link nella PEC: l'ente conferma (publisher creato o aggiornato con il nuovo code hosting, nella stessa transazione) o rifiuta |
| `/terze-parti` | **Richiesta di un software di terze parti** (sostituisce la issue template `add_new_software`): URL del repository con controllo immediato del `publiccode.yml`, le tre dichiarazioni, email del richiedente |
| `/accesso`, `/accesso/verifica` | Accesso con magic link. La pagina di verifica chiede un clic: un GET che consuma il token verrebbe bruciato dai sistemi che aprono in anticipo i link delle email |

I form pubblici hanno un rate limit per IP e un campo trappola per i bot. Manca ancora un captcha senza tracciamento (es. ALTCHA).

## Area riservata `/dashboard`

Serve una sessione: possono entrare gli indirizzi di `DASHBOARD_ALLOWED_EMAIL_DOMAINS` e `DASHBOARD_ALLOWED_EMAILS` (**VIEWER**, sola lettura) e quelli di `DASHBOARD_ADMIN_EMAILS` (**ADMIN**). Il ruolo viene ricalcolato a ogni accesso.

| Percorso | |
|---|---|
| `/dashboard` | **Cruscotto** (vedi sotto) |
| `/dashboard/software` | Tabella dei software; per gli ADMIN modifica ed elimina su ogni riga e "Software di terze parti" |
| `/dashboard/software/:id` (`/modifica`) | Dettaglio con log del crawler e `publiccode.yml`; modifica di URL, alias, amministrazione, stato e file |
| `/dashboard/software/terze-parti` | Aggiunta diretta di un software di terze parti: il repository diventa un code hosting "singolo repository" di un'organizzazione non PA, esistente o nuova; se il `publiccode.yml` è valido il software viene creato subito |
| `/dashboard/publishers` | Tabella delle amministrazioni; "Nuova organizzazione", modifica ed elimina su ogni riga |
| `/dashboard/publishers/:id` (`/modifica`) | Dettaglio con code hosting e **tabella dei software pubblicati**; form con ricerca IndicePA, code hosting (organizzazione o singolo repository), stato |
| `/dashboard/richieste` | Coda delle richieste di onboarding e di terze parti, con filtro per stato; gli ADMIN approvano o rifiutano (con nota, che arriva per email al richiedente delle terze parti) |

Ogni cella con un valore utile (nome, URL, codice IPA, email, ID) ha il pulsante **copia**, visibile al passaggio del mouse o con il focus da tastiera (sempre visibile sui dispositivi touch). Le azioni di modifica sono nascoste ai VIEWER, e l'API rifiuta comunque le loro scritture con 403.

L'area riservata è caricata a parte (lazy route di React Router), così chi apre l'onboarding pubblico non scarica le tabelle.

## Cruscotto

`/dashboard` mostra, dall'alto:

- **stato degli strumenti** (`GET /v2/health`, aggiornato ogni minuto): API, database (latenza, ultima migration), OpenSearch (salute del cluster, software indicizzati rispetto a quelli attivi nel database, età dell'indice puntato dall'alias), crawler, indexer e sync IndicePA (ultima esecuzione da `job_runs`: esito, durata, contatori; in ritardo oltre 26 ore, 8 giorni per IndicePA), SMTP, richieste rimaste sulle API di GitHub. Sotto, le ultime esecuzioni dei job;
- **totali** (KPI): software, amministrazioni, copertura delle PA di IndicePA, nuovi software e nuove amministrazioni negli ultimi 30 giorni con la variazione, richieste in attesa;
- **andamento** per settimana (26), mese (24) o anno: crescita del catalogo, nuovi software e amministrazioni, richieste ricevute;
- **composizione del catalogo** dai `publiccode.yml` dei software attivi: stato di sviluppo, manutenzione, amministrazioni con più software, tipo, licenze, piattaforme, versione dello standard, categorie, ambiti;
- **qualità dei dati**: software senza amministrazione, amministrazioni senza software, software non aggiornati da più di 2 anni, obsoleti, con YAML illeggibile, disattivati, con i primi esempi cliccabili.

Statistiche da `GET /v2/stats?interval=week|month|year`, in cache 5 minuti nell'API ("Aggiorna" le ricalcola). I grafici sono di [graph-italia-components](https://www.npmjs.com/package/graph-italia-components) (ECharts) e si caricano in un chunk separato (circa 560 kB compressi), dopo stato degli strumenti e qualità dei dati. Ogni grafico ha la tabella dei dati, l'informativa e lo scaricamento in CSV e PNG.

Due adattamenti per graph-italia: le icone di download sono in `public/graph-italia-sprites.svg` (solo le due usate, da Bootstrap Italia), e `styles.css` dichiara "Titillium Web" (il font che usa per i grafici) sugli stessi file di "Titillium Sans Pro" di `@italia-tailwind/css`.
