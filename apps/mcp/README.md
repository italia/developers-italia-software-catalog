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

Tutti i comandi si lanciano dalla radice del monorepo.

```sh
bun run dev --only api,mcp   # API v2 e server MCP su HTTP, in un terminale (container compresi)

# oppure separatamente
bun run dev:api        # l'API v2
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

## Provarlo a mano: MCP Inspector

[MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector) è il client di prova ufficiale. È un'interfaccia web che elenca strumenti, risorse e prompt del server e permette di chiamarli compilando gli argomenti, senza nessun modello di mezzo. Serve a vedere esattamente cosa riceve un assistente.

**1. Avvia l'API** (e, per la variante HTTP, anche il server MCP):

```sh
bun run dev --only api        # basta per la variante stdio
bun run dev --only api,mcp    # per la variante HTTP
```

**2. Apri l'Inspector**, in un altro terminale e sempre dalla radice. Ci sono due modi.

- **stdio:** è l'Inspector ad avviare il server, come farebbe Claude Desktop.

  ```sh
  npx @modelcontextprotocol/inspector -e API_BASEURL=http://localhost:3001/v2 bun apps/mcp/src/stdio.ts
  ```

- **HTTP:** l'Inspector si collega al server avviato da `bun run dev`, come farebbe un client remoto.

  ```sh
  npx @modelcontextprotocol/inspector
  ```

  Nell'interfaccia scegli *Transport Type*: **Streamable HTTP** e *URL*: `http://localhost:3002/mcp`.

Il comando stampa un indirizzo `http://localhost:6274/?MCP_PROXY_AUTH_TOKEN=…` e di solito apre il browser da solo. Premi **Connect**.

**3. Cose da provare:**

| Scheda | Prova | Cosa aspettarsi |
|---|---|---|
| Tools → `search_software` | `query`: `protocollo informatico`, `reuseOnly`: true | 19 risultati, tra i primi DocWay, PiTre, ADOC2_AVMTB (Comune di Bari); in fondo i conteggi per ambito e categoria e i `resource_link` alle schede |
| Tools → `search_software` | `scopes`: `["inventati"]` | errore di validazione: ambiti e categorie accettano solo i valori dello standard |
| Tools → `get_software` | un `id` preso dalla ricerca precedente | la scheda: descrizione, funzionalità, licenza, manutenzione, contatti, dipendenze |
| Tools → `find_administration` | `query`: `bari` | il Comune di Bari (`c_a662`) con i suoi software più recenti |
| Tools → `list_scopes` / `list_categories` | nessun argomento | i vocabolari con le etichette in italiano e il numero di software |
| Resources → Templates | `catalog://administrations/{ipa}`, scrivi `bari` | il completamento propone `c_a662` |
| Prompts → `find_reusable_software` | `need`: `prenotare appuntamenti all'anagrafe`, `scope`: inizia a scrivere `enti` | il testo del prompt che il modello riceverebbe, con il completamento dell'ambito |

Accanto a ogni risposta c'è il JSON grezzo, cioè sia `structuredContent` sia lo stesso contenuto come testo. Nella scheda *Server Notifications* compaiono gli eventuali errori.

## Esempio: un assistente su OpenRouter

[`examples/openrouter-agent.ts`](examples/openrouter-agent.ts) mostra il server MCP usato da un modello qualsiasi di [OpenRouter](https://openrouter.ai), un unico endpoint per centinaia di modelli di provider diversi. Lo script:

1. avvia il server MCP come farebbe un client: su stdio, oppure si collega a un server remoto con `--http`;
2. legge strumenti e istruzioni del server e li passa al modello nel formato `chat/completions`; le istruzioni diventano il messaggio di sistema;
3. esegue sul server MCP le chiamate che il modello chiede e gli restituisce i risultati, finché il modello non risponde;
4. stampa la risposta con le chiamate fatte, i token e il costo.

È lo stesso ciclo che fa un client MCP come Claude Desktop, scritto per esteso in circa 200 righe.

### Configurazione

Nel `.env` della radice (non va mai committato):

```sh
OPENROUTER_API_KEY=sk-or-…              # da https://openrouter.ai/keys
# OPENROUTER_MODEL=openai/gpt-4o-mini   # facoltativo, questo è il default
```

### Esecuzione

```sh
bun run dev --only api        # in un terminale: l'API v2 (il server MCP lo avvia lo script)

bun run mcp:openrouter "Un comune cerca un software per il protocollo informatico"
bun run mcp:openrouter --prompt "prenotare gli appuntamenti allo sportello anagrafe di un comune"
bun run mcp:openrouter --model anthropic/claude-sonnet-5.5 --verbose "SUAP per un comune"
bun run mcp:openrouter --http http://localhost:3002/mcp "software per la qualità dell'aria"   # con bun run dev --only api,mcp
```

Senza `--prompt` la domanda arriva al modello così com'è: di solito il modello fa una o due ricerche e risponde con l'elenco. Con `--prompt` lo script usa il prompt del server `find_reusable_software`, che guida il modello passo passo: cercare prima a riuso, provare formulazioni diverse, aprire le schede dei candidati migliori e motivare la scelta. Le risposte sono più complete, ma costano qualche chiamata in più.

### Un'esecuzione reale

11 novembre 2026, `openai/gpt-4o-mini`, `--prompt`, DB locale importato dalla produzione. Risposta accorciata:

```
$ bun run mcp:openrouter --prompt "prenotare gli appuntamenti allo sportello anagrafe di un comune"
modello openai/gpt-4o-mini · server MCP stdio

→ list_categories {}
→ list_scopes {}
→ search_software {"query":"prenotazione appuntamenti anagrafe","categories":["appointment-scheduling"],"scopes":["local-authorities"],"reuseOnly":true}
→ search_software {"query":"prenotazione appuntamenti","categories":["appointment-scheduling"],"scopes":["local-authorities"]}
→ search_software {"query":"prenotazione online","categories":["online-booking"],"scopes":["local-authorities"]}
→ search_software {"query":"gestione appuntamenti","categories":[],"scopes":[]}
→ get_software {"id": "0b993248-f3af-47a1-9887-9fc308635b4b"}
→ get_software {"id": "24243968-1fd9-4e43-ba22-39e383285b7f"}
  … altre 3 schede

Ecco una selezione di software a riuso e open source che possono soddisfare il bisogno
di prenotare appuntamenti per lo sportello anagrafe:

### 1. VIDE
- **Descrizione**: sistema di sportello intelligente per sportelli tradizionali e virtuali.
  Permette ai cittadini di prenotare appuntamenti e partecipare a videochiamate con gli operatori.
- **Pubblicato da**: Consorzio per il sistema informativo CSI-Piemonte.
- **Licenza**: GPL-3.0-or-later.  **A riuso**: Sì.
…
### 4. OpenCity Italia - La Stanza del Cittadino
- **Descrizione**: area personale e servizi digitali per i cittadini, inclusa la prenotazione di appuntamenti.
- **Licenza**: AGPL-3.0-or-later.  **A riuso**: No, è open source di terze parti.
…
### Limiti e considerazioni
Non ho trovato software specifico esclusivamente per "prenotazioni appuntamenti allo sportello
anagrafe", ma i candidati sopra possono aiutare a soddisfare questo bisogno in un contesto più ampio.

11 chiamate agli strumenti, token 47765 in / 1474 out, costo 0.0056 $
```

In questa esecuzione si vede come il modello usa il server:

- legge i vocabolari e traduce il bisogno in valori dello standard (`appointment-scheduling`, `local-authorities`);
- allarga la ricerca quando i risultati sono pochi;
- apre le schede prima di proporle;
- dichiara i limiti, come chiedono le istruzioni del server.

I link puntano ai repository. Con `CATALOG_PUBLIC_URL` nel `.env` dell'API puntano invece alle schede del catalogo.

### Opzioni e costi

Opzioni: `--model` (default `OPENROUTER_MODEL` o `openai/gpt-4o-mini`; va bene qualunque modello OpenRouter che supporti gli strumenti), `--prompt`, `--http <url>`, `--max-steps` (giri di strumenti, default 8), `--verbose` (stampa i risultati degli strumenti). Le istruzioni del server diventano il messaggio di sistema, quindi anche qui i testi dei software sono trattati come dati. Ogni esecuzione è una chiamata a pagamento: GPT-4o mini costa 0,15 $ per milione di token in ingresso e 0,60 $ in uscita, quindi una ricerca con qualche chiamata agli strumenti costa una frazione di centesimo; il costo reale compare nel riepilogo finale.

`bun test examples` prova il ciclo con un modello finto (strumenti MCP → funzioni, esecuzione delle chiamate, argomenti non validi, limite di giri), senza chiave e senza costi.

## Trasporto HTTP

Senza stato: un server e un trasporto per richiesta, solo `POST /mcp` (`GET` e `DELETE` rispondono 405, perché non ci sono sessioni), risposte JSON. Senza autenticazione, perché gli strumenti sono in sola lettura e i dati sono quelli del catalogo pubblico, con un limite di richieste per IP. `GET /health` per i controlli.

## Test

`bun test`: client e server MCP collegati in memoria, con un'API v2 finta (argomenti → parametri dell'API, riassunto del `publiccode.yml`, errori, vocabolari, risorse, completamento, prompt, trasporto HTTP).

## Valutazione della ricerca

`bun run mcp:eval` (dalla radice, con l'API avviata; `--json` per il dettaglio, `--min-pass 80` per fallire sotto una soglia): i casi di [`eval/cases.json`](eval/cases.json) sono richieste reali di PA (protocollo, SUAP, whistleblowing, siti comunali, pagoPA, cartella clinica, qualità dell'aria, biblioteche, appuntamenti, segnalazioni, firma, PNRR…), ciascuna con la chiamata a `search_software` che un buon assistente farebbe e i software che una risposta giusta deve includere (per nome e codice IPA, non per id). Per ogni caso: superato se almeno `minHits` attesi sono nei primi `k`, recall@k, posizione del primo atteso (MRR). Alcuni casi sono **varianti** della stessa richiesta con parole diverse, per vedere dove la ricerca è fragile.

Misura iniziale (10 novembre 2026, DB locale importato dalla produzione): **16/16 casi superati, recall media 0,85, MRR 0,93**. Punti deboli: le formulazioni diverse (`protocollazione` non trova DocWay e ADOC2, la sigla `SUAP` non trova VBG, `segnalazione illeciti` non trova GlobaLeaks), da migliorare con sinonimi e sigle nella ricerca.

Valuta lo strato di ricerca, deterministico e gratuito; non valuta come un modello sceglie gli argomenti o usa il prompt, che richiederebbe chiamate a pagamento (prossimo passo, sulle stesse richieste).
