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
| `/dashboard/software` | Tabella dei software; per gli ADMIN modifica ed elimina su ogni riga e "Software di terze parti" |
| `/dashboard/software/:id` (`/modifica`) | Dettaglio con log del crawler e `publiccode.yml`; modifica di URL, alias, amministrazione, stato e file |
| `/dashboard/software/terze-parti` | Aggiunta diretta di un software di terze parti: il repository diventa un code hosting "singolo repository" di un'organizzazione non PA, esistente o nuova; se il `publiccode.yml` è valido il software viene creato subito |
| `/dashboard/publishers` | Tabella delle amministrazioni; "Nuova organizzazione", modifica ed elimina su ogni riga |
| `/dashboard/publishers/:id` (`/modifica`) | Dettaglio con code hosting e **tabella dei software pubblicati**; form con ricerca IndicePA, code hosting (organizzazione o singolo repository), stato |
| `/dashboard/richieste` | Coda delle richieste di onboarding e di terze parti, con filtro per stato; gli ADMIN approvano o rifiutano (con nota, che arriva per email al richiedente delle terze parti) |

Ogni cella con un valore utile (nome, URL, codice IPA, email, ID) ha il pulsante **copia**, visibile al passaggio del mouse o con il focus da tastiera (sempre visibile sui dispositivi touch). Le azioni di modifica sono nascoste ai VIEWER, e l'API rifiuta comunque le loro scritture con 403.

L'area riservata è caricata a parte (lazy route di React Router), così chi apre l'onboarding pubblico non scarica le tabelle.
