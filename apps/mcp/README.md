# mcp

Server [MCP](https://modelcontextprotocol.io) del Catalogo del software a riuso e open source della PA: permette a un assistente (Claude, altri client MCP) di **trovare software a riuso a partire da un ambito o da un bisogno** espresso in linguaggio naturale, e di approfondire i candidati.

In sola lettura. Parla solo con l'API v2 del catalogo (`API_BASEURL`), mai direttamente con OpenSearch o con il database (decisione D18 del piano).

## Strumenti

| Strumento | Cosa fa | API |
|---|---|---|
| `search_software` | Testo libero più filtri: ambiti, categorie, stato di sviluppo, solo a riuso, misura e beneficiari PNRR, amministrazione (codice IPA), piattaforme, licenza. Restituisce i risultati e i conteggi per ambito e categoria | `GET /v2/search` |
| `get_software` | Scheda di un software per id o URL del repository: descrizione, funzionalità, licenza, manutenzione e contatti, dipendenze, lingue, amministrazione | `GET /v2/software/:id`, `?url=` |
| `find_administration` | Un'amministrazione per nome o codice IPA: se pubblica nel catalogo, quanti software e i più recenti, tipologia e sito da IndicePA; se non pubblica, la trova comunque in IndicePA | `/v2/publishers`, `/v2/ipa-entities`, `/v2/search` |
| `list_scopes` | I 24 ambiti dello standard con l'etichetta in italiano e il numero di software | `publiccode-schema` + conteggi da `/v2/search` |
| `list_categories` | Le 106 categorie dello standard, con etichetta e numero di software | `publiccode-schema` + conteggi da `/v2/search` |
| `list_pnrr_measures` | Misure e beneficiari PNRR delle liste editoriali | `/v2/vocabularies/pnrr-*` |

Nei risultati di `search_software`, oltre al JSON, c'è un collegamento (`resource_link`) alla scheda di ogni software, leggibile come risorsa.

## Risorse e prompt

| Risorsa | Contenuto |
|---|---|
| `catalog://vocabularies/scopes`, `…/categories`, `…/pnrr` | I vocabolari, come `list_scopes`, `list_categories`, `list_pnrr_measures` |
| `catalog://software/{id}` | La scheda di un software, come `get_software` |
| `catalog://administrations/{ipa}` | Un'amministrazione con i suoi software più recenti; il codice IPA si completa dal nome (`bari` → `c_a662`) |

Il prompt **`find_reusable_software`** ("Trova software a riuso per un ambito"; argomenti `need`, `scope` con completamento dalle etichette, `administration`) guida il modello: chiarire il bisogno, tradurlo in parole chiave e vocabolari, cercare prima a riuso, approfondire 3-5 candidati, proporre una rosa motivata con i link e dichiarare i limiti.

Ambiti, categorie, stati e piattaforme accettano solo i valori dello standard (lo schema dello strumento li elenca), così il modello non li inventa. Le istruzioni del server spiegano come combinarli: molti software non dichiarano l'ambito, quindi la ricerca testuale resta necessaria.

Ogni risposta ha i dati strutturati (`structuredContent`) e lo stesso JSON come testo. I testi dei software (nomi, descrizioni, funzionalità, contatti) vengono dai `publiccode.yml` di chi li pubblica: le istruzioni del server dicono al modello di trattarli come dati, mai come istruzioni.

## Avvio

```sh
bun run dev:api        # l'API v2 (dalla radice)

bun run mcp            # stdio, per un client in locale
bun run dev:mcp        # Streamable HTTP su http://localhost:3002/mcp (MCP_PORT)
```

Variabili: `API_BASEURL` (default `http://localhost:3001/v2`), `MCP_PORT`, `MCP_RATE_LIMIT` (richieste al minuto per IP, default 120), `TRUST_PROXY=true` dietro un proxy. I link alle schede del catalogo arrivano dall'API se ha `CATALOG_PUBLIC_URL`.

### In un client

Claude Code, in locale:

```sh
claude mcp add catalogo-software -e API_BASEURL=http://localhost:3001/v2 -- bun /percorso/del/monorepo/apps/mcp/src/stdio.ts
```

Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "catalogo-software": {
      "command": "bun",
      "args": ["/percorso/del/monorepo/apps/mcp/src/stdio.ts"],
      "env": { "API_BASEURL": "http://localhost:3001/v2" }
    }
  }
}
```

Servizio remoto (quando ci sarà, Fase 7): l'URL `…/mcp` del trasporto HTTP.

Per provarlo a mano: `npx @modelcontextprotocol/inspector bun apps/mcp/src/stdio.ts`.

## Trasporto HTTP

Senza stato: un server e un trasporto per richiesta, solo `POST /mcp` (`GET` e `DELETE` rispondono 405, perché non ci sono sessioni), risposte JSON. Senza autenticazione, perché gli strumenti sono in sola lettura e i dati sono quelli del catalogo pubblico, con un limite di richieste per IP. `GET /health` per i controlli.

## Test

`bun test`: client e server MCP collegati in memoria, con un'API v2 finta (argomenti → parametri dell'API, riassunto del `publiccode.yml`, errori, vocabolari, risorse, completamento, prompt, trasporto HTTP).

## Valutazione della ricerca

`bun run mcp:eval` (dalla radice, con l'API avviata; `--json` per il dettaglio, `--min-pass 80` per fallire sotto una soglia): i casi di [`eval/cases.json`](eval/cases.json) sono richieste reali di PA (protocollo, SUAP, whistleblowing, siti comunali, pagoPA, cartella clinica, qualità dell'aria, biblioteche, appuntamenti, segnalazioni, firma, PNRR…), ciascuna con la chiamata a `search_software` che un buon assistente farebbe e i software che una risposta giusta deve includere (per nome e codice IPA, non per id). Per ogni caso: superato se almeno `minHits` attesi sono nei primi `k`, recall@k, posizione del primo atteso (MRR). Alcuni casi sono **varianti** della stessa richiesta con parole diverse, per vedere dove la ricerca è fragile.

Misura iniziale (10 novembre 2026, DB locale importato dalla produzione): **16/16 casi superati, recall media 0,85, MRR 0,93**. Punti deboli: le formulazioni diverse (`protocollazione` non trova DocWay e ADOC2, la sigla `SUAP` non trova VBG, `segnalazione illeciti` non trova GlobaLeaks), da migliorare con sinonimi e sigle nella ricerca.

Valuta lo strato di ricerca, deterministico e gratuito; non valuta come un modello sceglie gli argomenti o usa il prompt, che richiederebbe chiamate a pagamento (prossimo passo, sulle stesse richieste).
