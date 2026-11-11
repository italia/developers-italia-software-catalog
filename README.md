# developers-italia-software-catalog

Monorepo (Bun workspaces) per il Catalogo del software pubblico di Developers Italia: API, crawler `publiccode.yml`, indicizzazione OpenSearch, catalogo pubblico, dashboard e onboarding delle PA.

Contesto e piano (l'architettura obiettivo è disegnata in [new-plan.md](new-plan.md#architettura-obiettivo)):

- [how-it-works.md](how-it-works.md): come funzionano i progetti attuali (crawler Go, API Go, onboarding-italia, catalogo-software, developers.italia.it)
- [new-plan.md](new-plan.md): attività per arrivare alla nuova architettura

## Struttura

| Percorso | Pacchetto | Stato | Sostituisce |
|---|---|---|---|
| `apps/api` | `@sw-catalog/api` | Hono: `/v2` con software, publisher, log, cataloghi (lettura); `/v1` solo `status` | `developers-italia-api` (Go) |
| `apps/crawler` | `@sw-catalog/crawler` | **funzionante**: GitHub, GitLab (anche su domini propri), Bitbucket, Gitea/Forgejo; senza vitalità | `publiccode-crawler` (Go) |
| `apps/indexer` | `@sw-catalog/indexer` | **funzionante**: indice versionato e swap dell'alias | `scripts/get-*.js` + `_bulk` di `developers.italia.it` |
| `apps/catalog-website` | `@sw-catalog/catalog-website` | **funzionante** (copiato da `catalogo-software`): ricerca, scheda del software, pagine delle amministrazioni (`/pa`, `/pa/:ipa`); filtri PNRR dalle liste editoriali dell'API | — |
| `apps/dashboard` | `@sw-catalog/dashboard` | **area pubblica**: onboarding delle PA con conferma via PEC, richiesta di software di terze parti; **area riservata `/dashboard`** (magic link): cruscotto con stato degli strumenti e statistiche, software, amministrazioni, liste editoriali con i loro software, coda delle richieste, CRUD per gli ADMIN ([dettagli](apps/dashboard/README.md)) | `onboarding-italia` + issue GitHub per software di terze parti |
| `apps/mcp` | `@sw-catalog/mcp` | **server MCP** per cercare software a riuso da un assistente: `search_software`, `get_software`, `find_administration`, ambiti, categorie e misure PNRR, sopra l'API v2; stdio e Streamable HTTP ([dettagli](apps/mcp/README.md)) | — |
| `packages/db` | `@sw-catalog/db` | schema Prisma 7, migration, client, import dai dati di produzione ([schema e relazioni](packages/db/README.md)) | modelli GORM dell'API |
| `packages/publiccode-validator` | `@sw-catalog/publiccode-validator` | regole del catalogo sopra `publiccode-schema` | `validateFile` del crawler Go |
| `packages/shared` | `@sw-catalog/shared` | tipi dell'API v2, normalizzazione degli URL | — |

`publiccode-schema` (il validatore dello standard) è un **repository separato** ([teamdigitale/publiccode-json-schema](https://github.com/teamdigitale/publiccode-json-schema)), usato come dipendenza npm ([`publiccode-schema`](https://www.npmjs.com/package/publiccode-schema)). Per provare modifiche locali: `bun run build && bun link` là, `bun link publiccode-schema` qui.

## Avvio rapido: il giro completo in locale

```sh
cp .env.example .env               # poi imposta API_TOKENS e API_BEARER_TOKEN (openssl rand -hex 24)
                                   # e le password di OpenSearch (vedi i commenti nel file)
bun install

bun run infra:up                   # postgres :5433, opensearch :9200 (sicurezza attiva) + ruoli e utenti
bun run infra:mail                 # mailpit: SMTP :1025, UI http://localhost:8025
bun run db:migrate:deploy          # crea le tabelle
bun run db:import                  # publisher e software dall'API pubblica di produzione
bun run ipa:sync                   # anagrafica IndicePA (enti e PEC) per l'onboarding
bun run db:seed:vocabularies       # liste editoriali (misure e beneficiari PNRR)
bun run db:studio                  # Prisma Studio: http://localhost:5555

bun run dev:api                    # http://localhost:3001/v2/status
GITHUB_TOKEN=… bun run crawl --publisher c_a662 --dry-run   # crawl di prova (senza --dry-run scrive nell'API)
bun run index                      # indicizza su OpenSearch (alias developers_italia_it)

bun run dev:dashboard              # http://localhost:5173 (area riservata: /dashboard, email in Mailpit)
VITE_ELASTICSEARCH_URL=http://localhost:9200 VITE_USE_MOCK=false VITE_API_URL=http://localhost:3001/v2 bun run dev:catalog-website   # http://localhost:3000
```

Dopo la prima configurazione, per il lavoro di tutti i giorni basta un comando:

```sh
bun run dev                        # container + API, dashboard, catalogo e MCP in un terminale; Ctrl+C ferma
bun run dev --only api,dashboard   # solo alcuni servizi (api, dashboard, catalog, mcp)
bun run dev --skip mcp             # tutti tranne alcuni
bun run dev --no-infra             # senza avviare i container
```

Avvia Docker se è spento (su macOS), alza i container e aspetta Postgres e OpenSearch, poi avvia prima l'API e, quando risponde, gli altri servizi, con i log prefissati per servizio. Un servizio la cui porta è già occupata, per esempio perché è già aperto in un altro terminale, viene saltato. Ctrl+C ferma i processi ma lascia accesi i container (`bun run infra:down` per fermarli).

Note:

- Il compose è in due file: **`compose.yaml`** è la base con la sicurezza attiva (utilizzabile da sola su un server: `docker compose -f compose.yaml up -d`), **`compose.local.yaml`** aggiunge solo cose da sviluppo. In locale `COMPOSE_FILE` nel `.env` li unisce, quindi `docker compose …` e gli script `infra:*` li usano entrambi.
- OpenSearch come in produzione: **senza credenziali** si può solo cercare sull'alias `developers_italia_it` (è così che legge il catalogo); l'indexer usa l'utente `OPENSEARCH_USER`/`OPENSEARCH_PASS`; `admin` ha la password `OPENSEARCH_INITIAL_ADMIN_PASSWORD`. Ruoli e utenti li crea `infra/opensearch/setup.sh` all'avvio.
- In locale OpenSearch è su `http://` (il TLS dell'HTTP è spento, autenticazione e ruoli no). Con `OPENSEARCH_HTTP_TLS=true` torna HTTPS con i certificati demo: la CA si copia con `docker compose cp opensearch:/usr/share/opensearch/config/root-ca.pem .` e si passa all'indexer con `OPENSEARCH_CA_FILE`.
- Postgres è sulla porta **5433** per non scontrarsi con un Postgres installato sul Mac.
- In sviluppo OpenSearch ignora le soglie del disco (`compose.local.yaml`): altrimenti blocca la creazione degli indici quando la VM di Docker è piena oltre il 90%.
- Senza `GITHUB_TOKEN` le API di GitHub consentono 60 richieste all'ora.
- Per entrare in `/dashboard` serve un indirizzo di `DASHBOARD_ALLOWED_EMAIL_DOMAINS` (sola lettura) o di `DASHBOARD_ADMIN_EMAILS` (modifica); il link di accesso arriva in Mailpit.

## API: versioni

- **`/v2`**: la versione principale. Contratto design-first in [apps/api/openapi/v2/openapi.yaml](apps/api/openapi/v2/openapi.yaml), codice in `apps/api/src/v2/`. Paginazione `page[size]` + `page[number]` (con totale, per la dashboard) oppure `page[after]` (cursore, per crawler e indexer). Letture pubbliche; scritture con `Authorization: Bearer <token>` (client macchina, token in `API_TOKENS`, provvisorio) oppure con la sessione di un ADMIN della dashboard. Endpoint della dashboard: `/v2/auth/*` (magic link), `/v2/ipa-entities`, `/v2/onboarding-requests`, `/v2/third-party-requests`, `/v2/stats` e `/v2/health` (cruscotto), `/v2/job-runs` (esecuzioni di crawler, indexer e sync IndicePA), `/v2/vocabularies` (liste editoriali, lettura pubblica), `/v2/search` (ricerca pubblica sopra OpenSearch con i filtri del catalogo e i conteggi per ambito e categoria), `/v2/software/:id/validation` e `/v2/software/:id/upgrade` (validazione per versione e aggiornamento del `publiccode.yml`, con `publiccode-schema` 0.2).
- **`/v1`**: compatibilità con `developers-italia-api` (Go) per i client attuali durante la migrazione. Contratto di riferimento in [apps/api/openapi/v1/open-catalog-api.oas.yaml](apps/api/openapi/v1/open-catalog-api.oas.yaml), codice in `apps/api/src/v1/`. Verrà dichiarata deprecata dopo il cutover.

## Comandi

| Comando | Cosa fa |
|---|---|
| `bun run typecheck` / `bun run test` | su tutti i workspace |
| `bun run db:migrate:deploy` / `db:migrate` / `db:generate` / `db:validate` | Prisma (il `.env` della radice viene letto da `prisma.config.ts`) |
| `bun run db:import [--only publishers\|software] [--limit N]` | importa i dati da un'API v1 (default produzione) |
| `bun run db:seed:vocabularies [--force] [--dry-run]` | carica le liste editoriali da `packages/db/seed/vocabularies/`; aggiunge solo le voci nuove, `--force` riporta etichette e ordine a quelli dei file |
| `bun run ipa:sync` | scarica gli enti dagli open data IndicePA e aggiorna `ipa_entities` in una transazione |
| `bun run crawl [--publisher <id\|IPA>]... [--limit N] [--dry-run]` | crawler |
| `bun run crawl:software <id\|url> <publisher> [--dry-run]` | crawl di un singolo software |
| `bun run index [--dry-run] [--keep N]` | indexer OpenSearch |
| `bun run dev [--only s,…] [--skip s,…] [--no-infra]` | tutto l'ambiente di sviluppo in un terminale: container, API, dashboard, catalogo e MCP (`scripts/dev.ts`) |
| `bun run dev:api` / `dev:dashboard` / `dev:catalog-website` | un singolo server di sviluppo |
| `bun run mcp` / `dev:mcp` | server MCP su stdio (per un client in locale) / su Streamable HTTP (`http://localhost:3002/mcp`) |
| `bun run mcp:openrouter [--prompt] [--model id] "domanda"` | esempio: un assistente su OpenRouter che usa il server MCP per rispondere (serve `OPENROUTER_API_KEY` nel `.env`; a pagamento) |
| `bun run mcp:eval [--json] [--min-pass N]` | valutazione della ricerca del server MCP sui casi di `apps/mcp/eval/cases.json` (serve l'API avviata) |
| `bun run db:studio` / `db:studio:stop` | avvia / ferma Prisma Studio nel compose: tabelle e valori del database su http://localhost:5555 |
| `bun run infra:mail` / `infra:mail:stop` | avvia / ferma Mailpit (SMTP `localhost:1025`, UI http://localhost:8025); i messaggi restano dopo un riavvio |
| `bun run mail:test [--to indirizzo]` | invia un'email di prova con la configurazione `SMTP_*` del `.env` e controlla che sia arrivata in Mailpit |

## CI e giro notturno

- [.github/workflows/ci.yml](.github/workflows/ci.yml): typecheck, test, build. Per ora parte solo a mano (`workflow_dispatch`); i trigger su push e PR sono commentati nel file.
- [.github/workflows/nightly.yml](.github/workflows/nightly.yml): crawl e poi index ogni notte. Spento finché non esiste l'infrastruttura di produzione: il cron è commentato e il job richiede la variabile `NIGHTLY_ENABLED=true` (variabili e segreti elencati nel file).

## Licenza

[AGPL-3.0-or-later](LICENSE), la stessa di `developers-italia-api` e `publiccode-crawler`, da cui deriva la logica portata qui.
