# Come funziona oggi il Catalogo del software di Developers Italia

Analisi dei progetti attuali, fatta leggendo il codice nei repository locali (novembre 2026). Serve come base per la riscrittura descritta in [new-plan.md](new-plan.md).

I percorsi indicati sono relativi a `_dtd/developers/`.

---

## 1. Il quadro d'insieme

Il catalogo è il risultato di **sei progetti** che si passano i dati a catena:

```
 developers.italia.it-data ── ogni giorno alle 15:00 UTC: IndicePA pec.txt ──► Elasticsearch "indicepa_pec"
   (repo di dati, GitHub)  ── ogni ora: dati GitHub (team, membri, issue) ──► file YAML/JSON nel repo
                                                                         │
                     onboarding-italia (Next.js) ◄── autocomplete + verifica IPA/PEC
                            │  POST/PATCH /v1/publishers  (token PASETO)
                            ▼
 publiccode-crawler ──► developers-italia-api ◄──────────────────────────┐
  (Go, notturno)        (Go + Postgres)                                  │
   GET catalogs/publishers  │                                            │
   POST/PATCH software,     │ GET /v1/software (solo attivi)             │
   POST log                 │ GET /v1/publishers                         │
                            ▼                                            │
                 developers.italia.it  (Jekyll, GitHub Action ogni notte alle 06:00 UTC)
                    ├─ _data/crawler/*.yml ──► pagine statiche ──► GitHub Pages
                    └─ elasticsearch.bulk + Searchyll ──► OpenSearch "developers_italia_it"
                                                                  │
                                                                  ▼
                                                     catalogo-software (React/Vite)
```

| Progetto | Ruolo | Stack | Stato |
|---|---|---|---|
| `old/publiccode-crawler` | Trova e valida i `publiccode.yml` nei repository delle PA e li salva nell'API | Go | **Non mantenuto**: lo sviluppo continua su `publiccodeyml/publiccode-crawler` |
| `developers-italia-api` (Open Catalog API) | Fonte di verità: cataloghi, publisher, software, log, webhook | Go, Fiber, GORM, Postgres | **Non mantenuto**: lo sviluppo continua su `publiccodeyml/open-catalog-api` |
| `onboarding-italia` | Portale con cui una PA registra la propria org di codice | Next.js 15, Prisma, Postgres | Attivo |
| `developers.italia.it` | Vecchio sito con il vecchio catalogo; **popola l'indice OpenSearch** | Jekyll, webpack, React | **In deprecazione** |
| `old/catalogo-software` (`italia/catalogo-software`) | Nuovo catalogo pubblico, in sola lettura | React 18, Vite, Bootstrap Italia | Attivo |
| `italia/developers.italia.it-data` (solo su GitHub, non in locale) | Popola l'indice `indicepa_pec` usato dall'onboarding; esporta dati della community GitHub per il vecchio sito | Ruby, Go, GitHub Actions | Attivo, legato al vecchio sito |

Progetti di contorno:

- `old/publiccode-parser-go`: il parser e validatore ufficiale, usato dal crawler. Anche questo ora è segnato come **non mantenuto** (commit `9fe860c`).
- `publiccode-editor`: valida con il parser Go compilato in WASM oppure con Ajv. L'implementazione Ajv (`src/app/validator/ajv/`: formati personalizzati, controlli in TS, SPDX, parsing degli URL alla Go) esiste solo qui.
- `publiccode-json-schema` (pacchetto `publiccode-schema`, AGPL-3.0-or-later come l'editor, non ancora pubblicato su npm): JSON Schema generati in TypeScript/Bun. `publiccode-schema-v0.json` valida tutte le versioni 0.x con le regole del parser; in più ci sono schemi per singola versione, form schema, vocabolari e una libreria per deprecazioni e aggiornamenti. La copertura delle regole del parser è documentata in `docs/validation-checklist.md`.
- `developers-italia-website-dato`: il nuovo sito Astro + DatoCMS, che ha **i suoi** indici OpenSearch, con un prefisso diverso.

> **Conseguenza critica.** L'unico processo che tiene aggiornato l'indice da cui legge il nuovo catalogo è la GitHub Action notturna di `developers.italia.it`, cioè del repository che sta per essere archiviato.

---

## 2. publiccode-crawler (Go)

Percorso: `old/publiccode-crawler`

### Cosa fa
Gira sulle piattaforme di code hosting delle PA, cerca i file `publiccode.yml`, li valida e salva il risultato nell'API.

### Comandi (Cobra)

| Comando | Descrizione |
|---|---|
| `crawl` | Senza argomenti scarica dall'API i **catalogs**; se non ce ne sono, i **publishers**. Accetta anche file `publishers.yml` locali |
| `crawl-software <id\|url> <publisher>` | Ricontrolla un singolo software |
| `download-publishers <url> <file>` | Converte la lista degli enti dell'onboarding (IPA + URL) in un `publishers.yml` |

Entrambi i comandi di crawl accettano `--dry-run`.

### Pipeline ([crawler/crawler.go](../old/publiccode-crawler/crawler/crawler.go))
1. **Ricerca dei repository.** Per ogni sorgente usa lo scanner giusto: GitHub, GitLab, Bitbucket, Gitea/Forgejo. `List` scandisce un'org o un gruppo, `Scan` un singolo repo. Le sorgenti dei catalogs accettano anche il driver `json`: un JSON remoto da cui gli URL si estraggono con JSONPath. I repo trovati finiscono in un channel.
2. **Elaborazione parallela**, un worker per CPU:
   - cerca il software nell'API tramite URL;
   - **salta i software disattivati a mano** (`active=false` e `created_at ≠ updated_at`);
   - scarica il `publiccode.yml` grezzo e lo valida con `libpubliccode` (publiccode-parser-go);
   - fa due controlli in più, che lo standard non richiede: l'`url` dichiarato deve stare nello stesso repo del file; se il publisher ha un `alternativeId`, `organisation.uri` deve essere uguale a `publishersNamespace + alternativeId`. Questi controlli non si fanno per il `MAIN_PUBLISHER_ID`.
3. **Upsert nell'API**:
   - software nuovo: POST **anche se il file non è valido**, con `active=false`, così `publiccode-issueopener` può avvisare i maintainer;
   - software già noto: PATCH di URL, alias (vecchio URL se il repo è stato rinominato) e YAML. Viene riattivato quando il file torna valido. Se è attivo non viene disattivato quando il file diventa invalido;
   - eccezione: un software creato inattivo con file ancora invalido non viene toccato, perché la PATCH cambierebbe `updated_at` e lo farebbe sembrare disattivato a mano.
4. **Vitalità** (salvo `SKIP_VITALITY`): clona il repo in `DATADIR` e calcola un indice sugli ultimi `ACTIVITY_DAYS` giorni (60 di default) secondo [vitality-ranges.yml](../old/publiccode-crawler/vitality-ranges.yml): autori, commit/merge, release, età del repo. Il metodo viene dalle Linee guida AgID per acquisizione e riuso. **Il risultato finisce solo nei log, non nell'API.**
5. **Log e metriche**: i log di ogni repo vengono inviati all'API (legati al software, al catalog o generici). Le metriche Prometheus contano processati, file validi e non validi, nuovi, già noti ed errori.

### Configurazione
`API_BASEURL`, `API_BEARER_TOKEN` (PASETO), `GITHUB_TOKEN` (obbligatorio), `MAIN_PUBLISHER_ID`, `DATADIR`, `SKIP_VITALITY`, `ACTIVITY_DAYS`.

---

## 3. developers-italia-api (Go)

Percorso: `old/developers-italia-api`

### Cosa fa
È il backend REST `/v1` del catalogo, con Fiber e GORM. Contratto in [open-catalog-api.oas.yaml](../old/developers-italia-api/open-catalog-api.oas.yaml).

- **Autenticazione PASETO v2**: le GET sono pubbliche, POST/PATCH/DELETE richiedono `Authorization: Bearer`. I token si creano con `token create`. Senza `PASETO_KEY` l'API è in sola lettura.
- **PATCH** con JSON Merge Patch.
- **Postgres** in produzione, **SQLite** se il DSN inizia con `file:` (test). Lo schema viene da `AutoMigrate`, senza migration versionate.
- **Webhook**: hook GORM `AfterCreate/Update/Delete` su publisher e software scrivono un `Event`; un debouncer (1s, massimo 10s) fa POST agli URL registrati con firma HMAC-SHA256 in `X-Webhook-Signature`.
- **Analysis**: campo JSONB su software e catalog, diviso per namespace e pensato per strumenti esterni. Ogni namespace deve avere `v` (intero da 1 a 999); l'API aggiunge `t` (timestamp).
- Cache di 10s sulle GET, rate limit facoltativo, `/metrics` Prometheus, healthcheck.
- `GET /v1/software` restituisce **solo i software attivi**, a meno di `?all=true`.

### Rotte principali
`/v1/catalogs` (+ `/publishers`, `/software`, `/analysis`, `/logs`), `/v1/publishers` (+ webhooks), `/v1/software` (+ webhooks, logs, analysis), `/v1/logs`, `/v1/webhooks/:id`, `/v1/status`.

### Tabelle ([internal/models/models.go](../old/developers-italia-api/internal/models/models.go))

| Tabella | Campi principali | Note |
|---|---|---|
| `catalogs` | `id`, `name`, `alternative_id` (unico; un valore speciale indica il catalogo **root**), `active`, `publishers_namespace`, `scopes` (JSON), `analysis` (JSONB + GIN) | |
| `catalog_sources` | `catalog_id`, `driver`, `url`, `args` (JSON) | 1:N con catalogs, cancellazione in cascata |
| `publishers` | `catalog_id` (NULL = root), `description` (**unica**), `email`, `active`, `alternative_id` (unico, di solito IPA) | |
| `publishers_code_hosting` | `publisher_id`, `url` (**unica** a livello globale), `group` | 1:N con publishers |
| `software` | `catalog_id`, `software_url_id` (FK unica verso l'URL principale), `publiccode_yml`, `active`, `vitality` (stringa), `analysis` | |
| `software_urls` | `url` (**unica**), `software_id` | Doppia relazione: URL canonico (belongs-to) e alias (has-many) |
| `logs` | `message`, `entity_id`, `entity_type`, `entity` (colonna **GENERATED**), `deleted_at` | Polimorfica |
| `webhooks` | `url`, `secret`, `entity_type`, `entity_id` | Vincolo unico (url, entity_id, entity_type) |
| `events` | `type` (create/update/delete), `entity_type`, `entity_id`, `deleted_at` | Storico per i webhook |

Il "catalogo root" corrisponde a `catalog_id IS NULL`. La struct `Bundle` esiste ma non viene migrata: è codice morto.

---

## 4. onboarding-italia (Next.js)

Percorso: `onboarding-italia`

### Cosa fa
Permette a una PA di registrare la propria org di codice. Alla fine crea o aggiorna il **publisher** nell'API: se il codice IPA è già un publisher aggiunge l'URL ai `codeHosting` con PATCH, altrimenti lo crea con POST usando `alternativeId` = IPA e `description` = nome dell'amministrazione.

### Flusso standard, con conferma via PEC
1. Form: IPA, amministrazione, referente, telefono, PEC, URL. L'amministrazione si compila in automatico dall'indice Elasticsearch `indicepa_pec`.
2. `POST /api/repository/request/create` salva una `RepositoryRequest` `PENDING` e invia alla **PEC dell'ente** una mail (MJML) con `/register-confirm?token=<JWT>`.
3. L'ente conferma (`/api/repository/register`, stato `ONBOARDED` e scrittura sull'API) oppure rifiuta (`/register/reject`, stato `REJECTED`).

### Fast onboarding (solo GitHub, senza mail)
1. `fast-onboarding/request/create` controlla che la coppia **IPA + PEC** esista in `indicepa_pec`.
2. `fast-onboarding/verify` trova il sito istituzionale dell'ente nel CSV IndicePA ([data/indice-pa-websites.csv](../onboarding-italia/data/indice-pa-websites.csv), circa 23.600 righe) e controlla con l'API GitHub che l'org sia **verified** e che il suo campo `blog` abbia lo stesso dominio.
3. `fast-onboarding/register` registra subito il publisher.

### Dashboard interna
`/dashboard`: mostra la tabella delle richieste ("LOGS TABLE"), con filtri, export ed eliminazione di quelle non approvate.

Accesso con **magic link** ([app/api/login/route.ts](../onboarding-italia/app/api/login/route.ts), [app/api/auth/route.ts](../onboarding-italia/app/api/auth/route.ts)):
1. l'operatore inserisce l'email; se è autorizzata riceve un link `/api/auth?code=<JWT>` (template [templates/loginTemplate.mjml](../onboarding-italia/templates/loginTemplate.mjml), invio con nodemailer; in sviluppo un account di test Ethereal);
2. aprendo il link, il JWT (firmato con `JWT_SECRET`, scadenza 1h) viene verificato e il server imposta un cookie `auth=ok` di 1h.

Indirizzi autorizzati: domini **scritti nel codice** (`@innovazione.gov.it`, `@agid.gov.it`) più quelli in `EMAIL_ONBOARDING_EMAIL_OVERRIDE_RECIPIENT_ADDR`, separati da `;`. La stessa variabile serve anche a **reindirizzare tutte le PEC in uscita** (per i test), quindi ha due significati (vedi S6).

### Database
Un **database Postgres separato** da quello di developers-italia-api (`DATABASE_URL` / `DIRECT_URL` proprie). Ha una sola tabella, `RepositoryRequest`: `id`, `ipa`, `nomeReferente`, `amministrazione`, `url`, `createdAt`, `updatedAt`, `onboardedCompletedAt`, `status` (`PENDING`/`ONBOARDED`/`REJECTED`).
- PEC e telefono **non vengono salvati**: passano solo nel JWT della mail.
- Non c'è uno storico: della richiesta si conosce solo lo stato finale, non chi ha confermato o rifiutato, né quando è partita la mail.
- Il legame con il publisher creato nell'API esiste solo tramite il codice IPA, senza un riferimento esplicito.

### Configurazione
`DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `NEXT_PUBLIC_APP_BASE_URL`, `NEXT_PUBLIC_ES_URL`, `NEXT_PUBLIC_FAST_ONBOARDING`, `DEVELOPERS_ITALIA_API_URL`, `ONBOARDING_PASETO_KEY`, `SMTP_ONBOARDING_SMTP_{HOSTNAME,PORT,SECURE,USERNAME,PASSWORD}`, `EMAIL_ONBOARDING_EMAIL_{FROM,SUBJECT,CC,BCC,OVERRIDE_RECIPIENT_ADDR}`.

### Dipendenze esterne
Elasticsearch (`indicepa_pec`), CSV IndicePA in locale, API GitHub, SMTP, developers-italia-api (PASETO).

---

## 5. developers.italia.it (Jekyll), il vecchio catalogo

Percorso: `old/developers.italia.it`

### Build ([publish.yml](../old/developers.italia.it/.github/workflows/publish.yml) + [Makefile](../old/developers.italia.it/Makefile))
Parte ogni notte alle 06:00 UTC, a ogni push su `main` e a mano.

1. **`make download-data`**
   - [scripts/get-software.js](../old/developers.italia.it/scripts/get-software.js): scarica `GET /v1/software` con paginazione a cursore da 100 (solo i software attivi). Fa il parsing di `publiccodeYml` e rende assoluti logo e screenshot (raw GitHub/Bitbucket/GitLab). Scrive:
     - righe in `elasticsearch.bulk`: `_id` = UUID e documento `{crawltime, slug (= UUID), publiccode, type: "software"}`;
     - `_data/crawler/software.yml` con `alias_pages` (URL e alias senza `https://`) e **senza** la chiave `url`, che andrebbe in conflitto con Jekyll e Searchyll.
   - [scripts/get-publishers.js](../old/developers.italia.it/scripts/get-publishers.js): scarica `GET /v1/publishers`, tiene solo quelli con `alternativeId` (IPA) e scrive nel bulk `{it-riuso-codiceIPA, it-riuso-codiceIPA-label, type: "administration"}` e in `_data/crawler/amministrazioni.yml` (`entityName`, `ipa`).
   - `wget` da `italia/developers.italia.it-data`: `github_members.yml`, `github_teams.yml`, `github_tech_list.yml`. Controlla anche che esista `github_issues.json`, letto dal browser a runtime.
2. **`make jekyll-build`**
   - `jekyll build` con [data_page_generator.rb](../old/developers.italia.it/_plugins/data_page_generator.rb), guidato da `page_gen` in [_config.yml](../old/developers.italia.it/_config.yml):
     - `/it|en/software/<uuid>.html` più **una pagina per ogni alias** (`/it/software/github.com/org/repo.html`);
     - `/it|en/pa/<ipa>.html` (template `brand-pa`);
     - `/it|en/api/<slug>.html` dalle voci di `_data/apis.yml` (Swagger UI).
   - **Searchyll** indicizza pagine, news e piattaforme, con analyzer `edge_ngram` ([_es_settings.yml](../old/developers.italia.it/_es_settings.yml), [_es_mappings.yml](../old/developers.italia.it/_es_mappings.yml)). Esclude `/software/*` e `/pa/*`. A ogni build **crea un indice nuovo con data e ora** (in produzione per esempio `developers_italia_it-20261108123129`) e ci sposta l'alias `developers_italia_it`: `developers_italia_it` è quindi un alias, non un indice.
   - `webpack` compila il bundle React (ricerca e catalogo, Swagger, newsletter).
   - Se `ELASTICSEARCH_PASS` è impostata: `POST $ELASTICSEARCH_URL/_bulk` con `elasticsearch.bulk`, poi `_refresh`. Il bulk scrive tramite l'alias nell'indice appena creato da Searchyll, quindi ogni notte l'indice riparte da zero.

Indice di produzione verificato il 9 novembre 2026 (ricerche pubbliche su `opensearch.developers.italia.it`; le mappings non sono leggibili, 403): 576 documenti `software`, 104 `administration`, 108 `news` e le pagine `platform`/`page`.
3. **Deploy**: `gh-pages` pubblica `_site` sul branch `gh-pages`, con CNAME `developers.italia.it`.

### File di dati

| Origine | File | Uso |
|---|---|---|
| Generati dall'API | `_data/crawler/software.yml`, `_data/crawler/amministrazioni.yml` | Pagine dei software e delle PA, liste |
| Repo `developers.italia.it-data` | `github_members.yml`, `github_teams.yml`, `github_tech_list.yml`, `github_issues.json` | Community, team, issue |
| Statici, tassonomie del catalogo | `publiccode_categories.yml`, `publiccode_scopes.yml`, `development_status.yml`, `software_pa_types.yml`, `pnrr_measures.yml`, `pnrr_targets.yml`, `languages.yml` | Filtri e label del catalogo |
| Statici, contenuti | `apis.yml`, `faq.yml`, `people.yml`, `l10n.yml` (circa 33KB di traduzioni it/en), menu, footer, social, `tools.yml` | Contenuti e UI |
| Redirect | `it/software/*.html`, `en/software/*.html` (411 per lingua) | Vecchi slug che rimandano a `/software/github.com/...` |

### Funzioni del vecchio catalogo da portare nel nuovo
- Pagine delle **amministrazioni** (`/pa/<ipa>`): elenco delle PA con IPA e software pubblicati da ciascun ente.
- Pagine dei software raggiungibili sia per UUID sia per **URL del repository** (alias), con i redirect dei vecchi slug.
- Catalogo delle API (OpenAPI e Swagger), che però appartiene più al sito che al catalogo.

---

## 6. catalogo-software (React/Vite)

Percorso: `old/catalogo-software` (repo `italia/catalogo-software`), copiato in `developers-italia-software-catalog/apps/catalog-website`. I link di questa sezione puntano alla copia nel monorepo

### Cosa fa
Frontend pubblico in sola lettura, con deploy su Vercel e rewrite SPA.

- `/` ([CataloguePage.tsx](apps/catalog-website/src/pages/CataloguePage.tsx)): ricerca full-text, filtri e caricamento progressivo, 12 elementi alla volta. Tutto lo stato sta nell'URL, quindi i link sono condivisibili.
- `/software/:slug` ([DetailPage.tsx](apps/catalog-website/src/pages/DetailPage.tsx)): funzionalità, descrizione Markdown, licenza, manutenzione e fornitori, conformità, piattaforme (SPID, CIE, pagoPA, IO, ANPR), dipendenze, enti utilizzatori, vitalità.

### Dati
**Non usa l'API.** Interroga direttamente OpenSearch (`opensearch.developers.italia.it`, indice `developers_italia_it`) con query costruite nel browser ([src/api/elasticsearch.ts](apps/catalog-website/src/api/elasticsearch.ts)). Con `VITE_USE_MOCK=true`, il default, usa un JSON statico.

- Un software è **a riuso** se ha `organisation.uri` oppure `it.riuso.codiceIPA`; altrimenti è **open source di terze parti**.
- Filtri: categorie, stato di sviluppo, `intendedAudience.scope`, PNRR (misura e beneficiari, letti dalle `features` con prefisso `PNRR/...`).
- Ordinamenti: rilevanza, data di release, `vitalityScore`, alfabetico (script Painless).

### Richieste di software di terze parti
Oggi passano da una **issue template GitHub** (`add_new_software.yaml`): checkbox (rilevante per la PA, NON di titolarità PA, `publiccode.yml` valido), URL del repository e note. Le issue vengono assegnate ai maintainer, che le gestiscono a mano.

---

## 7. developers.italia.it-data (repo di dati su GitHub)

Repository: `italia/developers.italia.it-data`. Non è clonato in locale: l'ho letto su GitHub. Licenza BSD-3-Clause.

È un repository che **contiene dati generati**, più due job che li producono. Fa due lavori diversi tra loro:

| Job | Workflow | Frequenza | Cosa fa | Chi usa i dati |
|---|---|---|---|---|
| `github_importer.rb` (Ruby, Octokit) | `update-files.yml` | **ogni ora** (minuto 30) | Esporta dalle org GitHub `teamdigitale` e `italia`: team e membri (`github_members.yml`, `github_teams.yml`), lista delle tecnologie da mostrare (`github_tech_list.yml`), issue con label `help wanted` / `Hacktoberfest` (`github_issues.json`). Fa commit dei file nel repo stesso | Il vecchio sito (`make download-data`, più `github_issues.json` letto dal browser) |
| `ipa-to-elasticsearch` (Go) | `update-ipa-elasticsearch.yaml` | **ogni giorno alle 15:00 UTC** | Scarica `pec.txt` dagli open data di IndicePA, **cancella e ricrea** l'indice Elasticsearch `indicepa_pec` con documenti `{ipa, description, type, pec}` | **onboarding-italia**: autocomplete dell'ente e verifica IPA/PEC |

Osservazioni:
- Il commento nel workflow dice che è "l'importer del vecchio publiccode-crawler": durante l'import **l'indice non è disponibile**, quindi l'onboarding non funziona per qualche minuto ogni giorno.
- La parte sulla community GitHub (team, membri, issue *help wanted*) **non riguarda il catalogo**: serve alle pagine community del sito.
- La parte IndicePA è invece **dominio del catalogo**: anagrafica degli enti, verifica dell'onboarding, pagine PA.

---

## 8. Problemi noti

### Sicurezza (onboarding-italia)

| # | Problema | Dove |
|---|---|---|
| S1 | **La dashboard si apre con un cookie qualsiasi.** Il codice controlla solo `cookies().has("auth")` e il valore impostato è la costante `"ok"`: basta creare a mano un cookie `auth` | [app/dashboard/page.tsx:13](../onboarding-italia/app/dashboard/page.tsx#L13) |
| S2 | **`/api/logs` non ha autenticazione.** La GET restituisce tutte le richieste (IPA, referente, URL); la DELETE cancella qualsiasi richiesta non approvata. Non c'è `middleware.ts` | [app/api/logs/route.ts](../onboarding-italia/app/api/logs/route.ts) |
| S3 | **La verifica del fast onboarding non blocca nulla lato server.** Se l'org non è verified o i domini non coincidono, ma entrambi esistono, la registrazione prosegue. L'endpoint non riceve un token, non ripete il controllo IPA/PEC e prende tutti i dati dal body. Quindi si può associare un'org GitHub qualsiasi (con `blog` impostato) al codice IPA di un ente | [fast-onboarding/register/route.ts](../onboarding-italia/app/api/repository/fast-onboarding/register/route.ts) |
| S4 | Il JWT nella mail di conferma **non scade** | [request/create/emailHandlers.ts](../onboarding-italia/app/api/repository/request/create/emailHandlers.ts) |
| S5 | `fast-onboarding/register` aggiorna la richiesta con un `id` scelto dal client, **dopo** aver già scritto sull'API | idem |
| S6 | `EMAIL_ONBOARDING_EMAIL_OVERRIDE_RECIPIENT_ADDR` ha due significati: un indirizzo aggiunto per ricevere le PEC di test diventa anche **autorizzato ad accedere alla dashboard**. In più, se un indirizzo non è autorizzato, la risposta lo dice ed elenca i domini ammessi | [app/api/login/route.ts](../onboarding-italia/app/api/login/route.ts) |

### Bug e refusi

| # | Problema | Dove | Effetto |
|---|---|---|---|
| B1 | `vitalityScore` non viene mai indicizzato: il crawler calcola la vitalità ma la scrive solo nei log, l'API ha un campo `vitality` mai valorizzato, il bulk non lo include e le mappings non lo dichiarano | crawler, `get-software.js`, `_es_mappings.yml` | **Verificato in produzione**: ordinare per vitalità restituisce l'errore *No mapping found for [vitalityScore] in order to sort on*. Nessun software nel DB ha `vitality` valorizzato |
| B2 | ~~Il bulk usa solo `index`, mai `delete`, quindi i documenti orfani restano~~ **Non è un problema**: Searchyll crea un indice nuovo a ogni build e il bulk ci scrive tramite l'alias (vedi §5) | — | Nessuno, finché Searchyll gira. Va preservato quando si sostituisce il giro notturno |
| B3 | Refuso `indendedAudience.unsupportedCountries` | [apps/catalog-website/src/api/elasticsearch.ts](apps/catalog-website/src/api/elasticsearch.ts) | L'esclusione nel filtro "open source" non si applica mai |
| B4 | Il campo di ricerca è `localizedName` (con la **z**), ma si chiama `localisedName` | idem | Il peso sul nome localizzato non vale |
| B5 | `site.data.ammninistrazioni` (refuso) | [_layouts/administrations.html:12](../old/developers.italia.it/_layouts/administrations.html#L12) | Il contatore delle PA mostra sempre 0 |
| B6 | `_data/apis.yml` punta a `software-catalog-api.oas.yaml`, ma il file è stato rinominato in `open-catalog-api.oas.yaml` | [_data/apis.yml](../old/developers.italia.it/_data/apis.yml) | Swagger dell'API del catalogo probabilmente rotto |
| B7 | Lo stesso indice contiene pagine, news, software e amministrazioni | `_config.yml` (Searchyll) + bulk | I consumer devono filtrare sempre per `type`; mappings miste |
| B8 | Nessuna migration versionata (`AutoMigrate`); colonna `logs.entity` GENERATED gestita con un workaround | `internal/database/database.go` | Evoluzione dello schema fragile |
| B9 | Struct `Bundle` non migrata | `internal/models/models.go` | Codice morto |
| B10 | La dipendenza `add` in catalogo-software è stata installata per errore (`bun add add`) | `package.json` | Già rimossa nel monorepo |
| B11 | L'import IndicePA cancella e ricrea `indicepa_pec` senza alias | `developers.italia.it-data/ipa-to-elasticsearch` | Ogni giorno l'onboarding resta qualche minuto senza dati sugli enti |
| B12 | L'autocomplete dell'onboarding cerca anche sul campo `cf` (codice fiscale), che l'import non indicizza | [onboarding-italia/lib/api.ts](../onboarding-italia/lib/api.ts) | Non si può cercare un ente per codice fiscale |
| B13 | Il filtro per destinatari del catalogo usa `term` su `publiccode.intendedAudience.scope`, che nell'indice è testo analizzato | [apps/catalog-website/src/api/elasticsearch.ts](apps/catalog-website/src/api/elasticsearch.ts) + mappings | **Verificato in produzione**: i valori con il trattino non trovano nulla (`local-authorities`: 0 risultati, contro 64 su `.keyword`) |
| B14 | Il crawler cerca il software solo con l'URL trovato nel code hosting. Un software salvato con l'URL di clone (`…/repo.git`) e senza alias non viene trovato, e il tentativo di crearlo fallisce con un conflitto | `crawler/crawler.go` (`GetSoftwareByURL(repository.URL)`) | Probabile errore ripetuto ogni notte. Riprodotto con la stessa logica nel porting TS su `riuso.comune.salerno.it/root/simel_2` |

### Debito architetturale
- Il catalogo pubblico interroga OpenSearch **direttamente dal browser**: l'indice deve essere pubblico e con CORS aperto, e la query DSL sta nel client.
- La vitalità richiede di **clonare per intero** ogni repository a ogni giro.
- I dati IndicePA sono duplicati in tre forme, prodotte da tre processi diversi: l'indice ES `indicepa_pec` (da developers.italia.it-data), un CSV con i siti istituzionali fermo dentro il repo dell'onboarding, e i publisher nell'API.
- I dati "statici" sono sparsi: tassonomie e liste editoriali nei `_data/*.yml` del vecchio sito, dati della community nel repo developers.italia.it-data, label e filtri ricopiati a mano nel nuovo catalogo.
- Le richieste di terze parti vivono in issue GitHub, fuori dal sistema: non c'è uno stato strutturato e non c'è validazione automatica.
- Quattro repository e quattro stack (Go, Go, Next.js, Jekyll + React) per un solo dominio.
- I due repository Go sono non mantenuti qui: l'evoluzione upstream è in `publiccodeyml/*`.
